export interface AdzunaJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary_min?: number;
  salary_max?: number;
}

const SEARCH_TERMS = [
  // animal care
  'animal care',
  'kennel technician',
  'pet care',
  'veterinary assistant',
  'animal shelter',
  'boarding attendant',
  // government / community service
  'recreation assistant',
  'activities assistant',
  'senior affairs',
  'community service assistant',
  // warehouse
  'warehouse associate',
  'shipping receiving associate',
  'fulfillment associate',
  'stocking associate',
  // retail (non-cashier)
  'merchandise associate',
  'overnight stocker',
  'inventory associate',
  'sales floor recovery',
  // general
  'client support representative',
  'customer service representative',
  'library page',
  'custodian',
  'housekeeping',
];

/**
 * Runs several targeted searches (Adzuna's `what` param is a single keyword
 * phrase, not a category filter) and merges/dedupes the results, because a
 * single broad query misses most of the roles that actually fit her.
 */
export async function fetchAdzunaJobs(
  appId: string,
  appKey: string,
  where: string
): Promise<AdzunaJob[]> {
  const byId = new Map<string, AdzunaJob>();

  for (const term of SEARCH_TERMS) {
    const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
    url.searchParams.set('app_id', appId);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('results_per_page', '25');
    url.searchParams.set('what', term);
    url.searchParams.set('where', where);
    url.searchParams.set('content-type', 'application/json');

    const res = await fetch(url.toString());
    if (!res.ok) {
      // One bad search term shouldn't kill the whole refresh.
      continue;
    }
    const data: any = await res.json();
    for (const r of data.results || []) {
      const id = String(r.id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        title: r.title || '',
        company: r.company?.display_name || '',
        location: r.location?.display_name || '',
        description: r.description || '',
        url: r.redirect_url || '',
        salary_min: r.salary_min,
        salary_max: r.salary_max,
      });
    }
  }

  return [...byId.values()];
}
