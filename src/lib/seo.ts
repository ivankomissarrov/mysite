import { site } from '../data/site';

export const personId = `${site.url}/#person`;
export const websiteId = `${site.url}/#website`;

export function absoluteUrl(path = '/'): string {
  return new URL(path, site.url).href;
}

export interface Breadcrumb {
  name: string;
  href: string;
}

export function personNode() {
  const imageUrl = absoluteUrl(site.avatar);
  return {
    '@type': 'Person',
    '@id': personId,
    name: site.author.name,
    givenName: site.author.givenName,
    familyName: site.author.familyName,
    additionalName: site.author.patronymic,
    alternateName: [...new Set([site.author.legalName, ...site.seo.alternateNames])],
    url: site.url,
    image: {
      '@type': 'ImageObject',
      url: imageUrl,
      caption: site.seo.imageAlt,
    },
    jobTitle: site.author.jobTitle,
    description: site.description,
    telephone: site.phoneTel,
    sameAs: [...site.author.sameAs],
    knowsAbout: [...site.seo.knowsAbout],
    hasOccupation: {
      '@type': 'Occupation',
      name: site.author.jobTitle,
    },
    worksFor: [
      { '@type': 'Organization', name: 'Гильдия разработчиков настольных игр' },
      { '@type': 'Organization', name: 'Граникон' },
    ],
    affiliation: [
      { '@type': 'EducationalOrganization', name: 'Universal University' },
      { '@type': 'EducationalOrganization', name: 'Scream School' },
    ],
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    url: site.url,
    name: site.author.name,
    alternateName: site.title,
    description: site.description,
    inLanguage: site.language,
    about: { '@id': personId },
    publisher: { '@id': personId },
    author: { '@id': personId },
  };
}

export function profilePageNode() {
  return {
    '@type': 'ProfilePage',
    '@id': `${site.url}/#profile`,
    url: `${site.url}/`,
    name: site.author.name,
    inLanguage: site.language,
    mainEntity: { '@id': personId },
    about: { '@id': personId },
    isPartOf: { '@id': websiteId },
  };
}

export function breadcrumbNode(items: Breadcrumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function articleNode(input: {
  title: string;
  description: string;
  url: string;
  published: string;
  updated: string;
  cover?: string;
}) {
  return {
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.published,
    dateModified: input.updated,
    inLanguage: site.language,
    mainEntityOfPage: input.url,
    author: { '@id': personId },
    publisher: { '@id': personId },
    ...(input.cover
      ? {
          image: {
            '@type': 'ImageObject',
            url: absoluteUrl(input.cover),
          },
        }
      : {}),
  };
}

export function graphJsonLd(extra: object[] = []) {
  return {
    '@context': 'https://schema.org',
    '@graph': [websiteNode(), personNode(), ...extra],
  };
}
