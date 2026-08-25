import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://cyber-research-radar.yulliwas.chatgpt.site',
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}
