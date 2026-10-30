export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'INACTIVE';
export interface EducationalModule {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: PublicationStatus;
  sortOrder: number;
  _count?: { contents: number };
}
export interface EducationalContent {
  id: string;
  moduleId: string;
  title: string;
  summary: string | null;
  content: string;
  learningObjective: string | null;
  status: PublicationStatus;
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
  module: Pick<EducationalModule, 'id' | 'code' | 'title' | 'status'>;
  _count?: { media: number };
}

export interface MediaAsset {
  id: string;
  contentId: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  mimeType: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  sizeBytes: number | null;
  status: PublicationStatus;
  sortOrder: number;
  isPrimary: boolean;
}
