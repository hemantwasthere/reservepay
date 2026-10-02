export type MerchantProfile = {
  displayName: string;
  website?: string;
  contactEmail?: string;
  description?: string;
};

const clean = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
};

export function validateProfile(profile: MerchantProfile): MerchantProfile {
  const displayName = profile.displayName.trim();
  if (
    displayName.length < 2 ||
    displayName.length > 60 ||
    /[\x00-\x1f\x7f]/.test(displayName)
  )
    throw new Error("Enter a display name of 2–60 characters without line breaks.");
  const website = clean(profile.website);
  if (website) {
    if (website.length > 200 || !/^https:\/\//.test(website))
      throw new Error("Websites must start with https://");
    try {
      new URL(website);
    } catch {
      throw new Error("Enter a valid website URL.");
    }
  }
  const contactEmail = clean(profile.contactEmail);
  if (
    contactEmail &&
    (contactEmail.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
  )
    throw new Error("Enter a valid contact email.");
  const description = clean(profile.description);
  if (description && (description.length > 280 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(description)))
    throw new Error("Keep the description under 280 characters.");
  return { displayName, website, contactEmail, description };
}
