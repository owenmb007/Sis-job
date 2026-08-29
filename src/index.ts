import { fetchAdzunaJobs } from './lib/adzuna';
import { scoreJob, suggestResumeCategory, type Profile } from './lib/scoring';
import { generateCoverNote } from './lib/coverNote';

export interface Env {
  DB: D1Database;
  RESUMES: R2Bucket;
  ASSETS: Fetcher;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

async function getProfile(db: D1Database): Promise<Profile & Record<string, unknown>> {
  const row = await db.prepare('SELECT * FROM profile WHERE id = 1').first();
  if (!row) throw new Error('profile not seeded — run schema.sql');
  return {
    ...row,
    exclude_keywords: JSON.parse(row.exclude_keywords as string),
    cash_handling_keywords: JSON.parse(row.cash_handling_keywords as string),
    boost_keywords: JSON.parse(row.boost_keywords as string),
    simple_task_keywords: JSON.parse(row.simple_task_keywords as string),
    caution_keywords: JSON.parse(row.caution_keywords as string),
  } as Profile & Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      // ---- Profile ----
      if (pathname === '/api/profile' && request.method === 'GET') {
        return json(await getProfile(env.DB));
      }
      if (pathname === '/api/profile' && request.method === 'PUT') {
        const body: any = await request.json();
        await env.DB.prepare(
          `UPDATE profile SET name=?, location=?, radius_miles=?, exclude_keywords=?, cash_handling_keywords=?, boost_keywords=?, simple_task_keywords=?, caution_keywords=?, notes=? WHERE id=1`
        )
          .bind(
            body.name,
            body.location,
            body.radius_miles,
            JSON.stringify(body.exclude_keywords || []),
            JSON.stringify(body.cash_handling_keywords || []),
            JSON.stringify(body.boost_keywords || []),
            JSON.stringify(body.simple_task_keywords || []),
            JSON.stringify(body.caution_keywords || []),
            body.notes || ''
          )
          .run();
        return json(await getProfile(env.DB));
      }

      // ---- Jobs ----
      if (pathname === '/api/jobs' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT * FROM jobs
           WHERE excluded = 0
             AND id NOT IN (SELECT job_id FROM applications)
           ORDER BY score DESC, fetched_at DESC LIMIT 200`
        ).all();
        return json(results);
      }

      if (pathname === '/api/jobs/refresh' && request.method === 'POST') {
        if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
          return json(
            { error: 'Adzuna API credentials not configured. See README setup steps.' },
            { status: 400 }
          );
        }
        const profile = await getProfile(env.DB);
        const raw = await fetchAdzunaJobs(
          env.ADZUNA_APP_ID,
          env.ADZUNA_APP_KEY,
          (profile as any).location
        );

        const resumes = await env.DB.prepare('SELECT id, category FROM resumes').all();
        const resumeByCategory = new Map<string, number>();
        for (const r of resumes.results as any[]) {
          if (!resumeByCategory.has(r.category)) resumeByCategory.set(r.category, r.id);
        }

        let inserted = 0;
        let excluded = 0;
        for (const jobItem of raw) {
          const { score, excluded: isExcluded, flags } = scoreJob(
            jobItem.title,
            jobItem.company,
            jobItem.description,
            profile
          );
          if (isExcluded) excluded++;
          else inserted++;

          const category = suggestResumeCategory(jobItem.title, jobItem.description);
          const suggestedResumeId = resumeByCategory.get(category) ?? resumeByCategory.get('general') ?? null;

          await env.DB.prepare(
            `INSERT INTO jobs (source, external_id, title, company, location, description, url, salary_min, salary_max, score, excluded, flags, suggested_resume_id)
             VALUES ('adzuna', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source, external_id) DO UPDATE SET
               title=excluded.title, company=excluded.company, location=excluded.location,
               description=excluded.description, url=excluded.url, salary_min=excluded.salary_min,
               salary_max=excluded.salary_max, score=excluded.score, excluded=excluded.excluded,
               flags=excluded.flags, suggested_resume_id=excluded.suggested_resume_id, fetched_at=datetime('now')`
          )
            .bind(
              jobItem.id,
              jobItem.title,
              jobItem.company,
              jobItem.location,
              jobItem.description,
              jobItem.url,
              jobItem.salary_min ?? null,
              jobItem.salary_max ?? null,
              score,
              isExcluded ? 1 : 0,
              JSON.stringify(flags),
              suggestedResumeId
            )
            .run();
        }

        return json({ fetched: raw.length, matched: inserted, excluded });
      }

      // ---- Resumes ----
      if (pathname === '/api/resumes' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM resumes ORDER BY uploaded_at DESC').all();
        return json(results);
      }

      if (pathname === '/api/resumes' && request.method === 'POST') {
        const form = await request.formData();
        const file = form.get('file') as File | null;
        const label = String(form.get('label') || '');
        const category = String(form.get('category') || 'general');
        if (!file || !label) {
          return json({ error: 'file and label are required' }, { status: 400 });
        }
        const key = `resumes/${Date.now()}-${file.name}`;
        await env.RESUMES.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
        });
        const result = await env.DB.prepare(
          `INSERT INTO resumes (label, category, r2_key, filename, content_type) VALUES (?, ?, ?, ?, ?)`
        )
          .bind(label, category, key, file.name, file.type || 'application/octet-stream')
          .run();
        return json({ id: result.meta.last_row_id, label, category, r2_key: key, filename: file.name });
      }

      const resumeDownloadMatch = pathname.match(/^\/api\/resumes\/(\d+)\/download$/);
      if (resumeDownloadMatch && request.method === 'GET') {
        const id = Number(resumeDownloadMatch[1]);
        const row = await env.DB.prepare('SELECT * FROM resumes WHERE id = ?').bind(id).first();
        if (!row) return json({ error: 'not found' }, { status: 404 });
        const obj = await env.RESUMES.get(row.r2_key as string);
        if (!obj) return json({ error: 'file missing in storage' }, { status: 404 });
        return new Response(obj.body, {
          headers: {
            'content-type': (row.content_type as string) || 'application/octet-stream',
            'content-disposition': `attachment; filename="${row.filename}"`,
          },
        });
      }

      const resumeDeleteMatch = pathname.match(/^\/api\/resumes\/(\d+)$/);
      if (resumeDeleteMatch && request.method === 'DELETE') {
        const id = Number(resumeDeleteMatch[1]);
        const row = await env.DB.prepare('SELECT * FROM resumes WHERE id = ?').bind(id).first();
        if (row) {
          await env.RESUMES.delete(row.r2_key as string);
          await env.DB.prepare('DELETE FROM resumes WHERE id = ?').bind(id).run();
        }
        return json({ ok: true });
      }

      // ---- Applications ----
      if (pathname === '/api/applications' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT applications.*, jobs.title, jobs.company, jobs.url AS job_url, resumes.label AS resume_label
           FROM applications
           JOIN jobs ON jobs.id = applications.job_id
           LEFT JOIN resumes ON resumes.id = applications.resume_id
           ORDER BY applications.updated_at DESC`
        ).all();
        return json(results);
      }

      if (pathname === '/api/applications' && request.method === 'POST') {
        const body: any = await request.json();
        if (!body.job_id) return json({ error: 'job_id required' }, { status: 400 });

        const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(body.job_id).first();
        if (!job) return json({ error: 'job not found' }, { status: 404 });

        const resumeId = body.resume_id ?? job.suggested_resume_id ?? null;
        const resume = resumeId
          ? await env.DB.prepare('SELECT * FROM resumes WHERE id = ?').bind(resumeId).first()
          : null;

        const profile = await getProfile(env.DB);
        const notes =
          body.notes ??
          (resume
            ? generateCoverNote({
                applicantName: (profile as any).name,
                jobTitle: job.title as string,
                company: (job.company as string) || '',
                resumeLabel: resume.label as string,
                resumeCategory: resume.category as string,
              })
            : '');

        const result = await env.DB.prepare(
          `INSERT INTO applications (job_id, status, resume_id, notes) VALUES (?, 'draft', ?, ?)`
        )
          .bind(body.job_id, resumeId, notes)
          .run();
        return json({ id: result.meta.last_row_id, notes });
      }

      const appPatchMatch = pathname.match(/^\/api\/applications\/(\d+)$/);
      if (appPatchMatch && request.method === 'PATCH') {
        const id = Number(appPatchMatch[1]);
        const body: any = await request.json();
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const key of ['status', 'resume_id', 'notes'] as const) {
          if (key in body) {
            fields.push(`${key} = ?`);
            values.push(body[key]);
          }
        }
        if (body.status === 'applied') {
          fields.push(`applied_at = datetime('now')`);
        }
        fields.push(`updated_at = datetime('now')`);
        if (fields.length === 0) return json({ error: 'no fields to update' }, { status: 400 });
        values.push(id);
        await env.DB.prepare(`UPDATE applications SET ${fields.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run();
        return json({ ok: true });
      }

      if (appPatchMatch && request.method === 'DELETE') {
        const id = Number(appPatchMatch[1]);
        await env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      return json({ error: 'not found' }, { status: 404 });
    } catch (err: any) {
      return json({ error: err.message || String(err) }, { status: 500 });
    }
  },
};
