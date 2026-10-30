export interface HealthResponse {
  status: 'ok';
  service: 'lensegua-api';
  database: 'connected';
  timestamp: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions?: string[];
}

export interface AuthResponse {
  user: AuthUser;
}

export interface PublicModule {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lessonCount: number;
  image?: { url: string; altText: string | null };
}

export interface PublicLessonSummary {
  id: string;
  title: string;
  summary: string | null;
  image?: { url: string; altText: string | null };
}

export interface PublicModuleDetail {
  module: PublicModule;
  lessons: PublicLessonSummary[];
}

export interface PublicMedia {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
}

export interface PublicLessonDetail {
  lesson: PublicLessonSummary & {
    content: string;
    learningObjective: string | null;
    media: PublicMedia[];
  };
  module: PublicModule;
  lessons: PublicLessonSummary[];
}
