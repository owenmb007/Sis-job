const CATEGORY_PHRASE: Record<string, string> = {
  animal:
    "I care about animal welfare and have hands-on kennel and veterinary-support experience.",
  government:
    "I'm drawn to community-focused work and have experience supporting youth and community programs.",
  warehouse:
    "I'm reliable, detail-oriented, and comfortable with hands-on stocking and facility support work.",
  retail:
    "I enjoy customer-facing work and have experience supporting store operations.",
  general:
    "I'm a dependable, quick learner looking to bring strong communication and teamwork skills to your team.",
};

export interface DraftInputs {
  applicantName: string;
  jobTitle: string;
  company: string;
  resumeLabel: string;
  resumeCategory: string;
}

/**
 * Produces a short, editable cover-note draft. This is a starting point for
 * a human to review and adjust — never sent anywhere on its own.
 */
export function generateCoverNote(inputs: DraftInputs): string {
  const phrase = CATEGORY_PHRASE[inputs.resumeCategory] || CATEGORY_PHRASE.general;
  const company = inputs.company || 'your team';
  return [
    `Hi, I'm ${inputs.applicantName}. I'm applying for the ${inputs.jobTitle} position at ${company}.`,
    phrase,
    `I've attached my resume (${inputs.resumeLabel}) and would welcome the chance to discuss how I can contribute. Thank you for your time and consideration.`,
    '',
    "[DRAFT — review and edit before applying, then change status to Approved once it's ready.]",
  ].join('\n\n');
}
