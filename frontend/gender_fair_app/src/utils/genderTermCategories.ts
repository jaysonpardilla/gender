export const GENDER_TERM_CATEGORIES = [
  { value: 'gendered_occupational_term', label: 'Gendered occupational term' },
  { value: 'gender_exclusive_expression', label: 'Gender-exclusive expression' },
  { value: 'gender_stereotype', label: 'Gender stereotype' },
  { value: 'gendered_pronoun', label: 'Gendered pronoun' },
  { value: 'gendered_title', label: 'Gendered title' },
  { value: 'other', label: 'Other' },
] as const;

const categoryLabels = new Map(
  GENDER_TERM_CATEGORIES.map(({ value, label }) => [value, label])
);

export const getGenderTermCategoryLabel = (category: string | undefined): string =>
  categoryLabels.get(category as (typeof GENDER_TERM_CATEGORIES)[number]['value']) || 'Other';
