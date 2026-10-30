import { Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import {
  LearningHome,
  LearningLayout,
  LearningLesson,
  LearningModule,
  LearningNotFound,
} from './pages/LearningPortal';

import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminLayout } from './layout/AdminLayout';
import { AdminDashboard } from './pages/AdminDashboard';
import { ContentFormPage } from './pages/ContentFormPage';
import { ContentsPage } from './pages/ContentsPage';
import { LoginPage } from './pages/LoginPage';
import { ModulesPage } from './pages/ModulesPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  return (
    <Routes>
      <Route element={<LearningLayout />}>
        <Route index element={<LearningHome />} />
        <Route path="aprender/:moduleId" element={<LearningModule />} />
        <Route path="aprender/:moduleId/:contentId" element={<LearningLesson />} />
        <Route path="*" element={<LearningNotFound />} />
      </Route>
      <Route
        element={
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        }
      >
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="modulos" element={<ModulesPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="contenidos" element={<ContentsPage />} />
            <Route path="contenidos/nuevo" element={<ContentFormPage />} />
            <Route path="contenidos/:id/editar" element={<ContentFormPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
