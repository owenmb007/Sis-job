export interface Profile {
  exclude_keywords: string[];
  cash_handling_keywords: string[];
  boost_keywords: string[];
  simple_task_keywords: string[];
  caution_keywords: string[];
}

export interface ScoreResult {
  score: number;
  excluded: boolean;
  flags: string[];
}

function countHits(haystack: string, needles: string[]): { count: number; hits: string[] } {
  const hits: string[] = [];
  for (const needle of needles) {
    const n = needle.trim().toLowerCase();
    if (n && haystack.includes(n)) hits.push(needle);
  }
  return { count: hits.length, hits };
}

/**
 * Scores a job posting against the profile's constraints.
 * Hard-excludes anything matching a blacklisted employer/keyword or any
 * cash-handling signal — those are non-negotiable per her situation.
 */
export function scoreJob(
  title: string,
  company: string,
  description: string,
  profile: Profile
): ScoreResult {
  const titleLc = (title || '').toLowerCase();
  const companyLc = (company || '').toLowerCase();
  const descLc = (description || '').toLowerCase();
  const fullText = `${titleLc} ${companyLc} ${descLc}`;

  const flags: string[] = [];

  const blacklist = countHits(fullText, profile.exclude_keywords);
  if (blacklist.count > 0) {
    for (const h of blacklist.hits) flags.push(`blacklist:${h}`);
    return { score: -999, excluded: true, flags };
  }

  const cash = countHits(fullText, profile.cash_handling_keywords);
  if (cash.count > 0) {
    for (const h of cash.hits) flags.push(`cash_handling:${h}`);
    return { score: -999, excluded: true, flags };
  }

  let score = 0;

  const boostTitle = countHits(titleLc, profile.boost_keywords);
  const boostDesc = countHits(descLc, profile.boost_keywords);
  score += boostTitle.count * 4;
  score += boostDesc.count * 1;
  if (boostTitle.count > 0) flags.push('animal_or_kids_focus');

  const simpleTitle = countHits(titleLc, profile.simple_task_keywords);
  score += simpleTitle.count * 2;
  if (simpleTitle.count > 0) flags.push('simple_task_role');

  const caution = countHits(fullText, profile.caution_keywords);
  if (caution.count > 0) {
    score -= caution.count * 3;
    for (const h of caution.hits) flags.push(`caution:${h}`);
  }

  return { score, excluded: false, flags };
}

export function suggestResumeCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (/(animal|pet |dog |cat |vet|kennel|shelter|zoo|wildlife)/.test(text)) return 'animal';
  if (/(recreation assistant|activities? assistant|senior affairs|community service|city of|county|assisted living)/.test(text)) {
    return 'government';
  }
  if (/(warehouse|fulfillment|shipping|receiving clerk|distribution center)/.test(text)) return 'warehouse';
  if (/(stock|retail|store associate|merchandis)/.test(text)) return 'retail';
  return 'general';
}
