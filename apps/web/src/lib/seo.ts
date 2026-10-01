export const site = {
  url: "https://reservepay-delta.vercel.app/",
  name: "ReservePay",
  title: "ReservePay | Protected USDC Payments on Solana",
  description:
    "Explore protected USDC payments on Solana. ReservePay pairs instant merchant settlement with reserves that back full refunds for open orders.",
  image: "https://reservepay-delta.vercel.app/og-image.png",
};

export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site.url}#organization`,
      name: site.name,
      url: site.url,
      logo: `${site.url}logo.svg`,
      sameAs: ["https://github.com/hemantwasthere/reservepay"],
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}#website`,
      url: site.url,
      name: site.name,
      description: site.description,
      inLanguage: "en",
      publisher: { "@id": `${site.url}#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${site.url}#webpage`,
      url: site.url,
      name: site.title,
      description: site.description,
      isPartOf: { "@id": `${site.url}#website` },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: site.image,
        width: 1200,
        height: 630,
      },
      inLanguage: "en",
    },
  ],
};
