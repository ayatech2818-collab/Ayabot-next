// Shared by the product form (instant feedback) and the server actions (authoritative check).
// Limits mirror ProductCreate in ayabot-backend/app/schemas/product.py.

export const NAME_MIN = 2;
export const NAME_MAX = 150;
export const SLUG_MIN = 2;
export const SLUG_MAX = 100;
export const DESCRIPTION_MAX = 2000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
};

export type ProductField = keyof ProductFormValues;
export type ProductFieldErrors = Partial<Record<ProductField, string>>;

/** "AYABOT Voice 2" -> "ayabot-voice-2" */
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

export function normalizeProductValues(values: ProductFormValues): ProductFormValues {
  return {
    name: values.name.trim().replace(/\s+/g, " "),
    slug: values.slug.trim().toLowerCase(),
    description: values.description.trim(),
  };
}

export function validateProductValues(values: ProductFormValues): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  const { name, slug, description } = normalizeProductValues(values);

  if (!name) errors.name = "Name is required.";
  else if (name.length < NAME_MIN) errors.name = `Name must be at least ${NAME_MIN} characters.`;
  else if (name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`;

  if (!slug) errors.slug = "Slug is required.";
  else if (slug.length < SLUG_MIN) errors.slug = `Slug must be at least ${SLUG_MIN} characters.`;
  else if (slug.length > SLUG_MAX) errors.slug = `Slug must be ${SLUG_MAX} characters or fewer.`;
  else if (!SLUG_PATTERN.test(slug)) errors.slug = "Use lowercase letters, numbers and single hyphens (e.g. ayabot-voice).";

  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }

  return errors;
}
