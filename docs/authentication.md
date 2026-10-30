# Autenticación y autorización

El acceso está limitado a usuarios internos con rol `ADMINISTRADOR` o `DOCENTE`. No existe
registro público ni autenticación para estudiantes.

Las contraseñas se almacenan con Argon2id. El token de acceso dura 15 minutos y el de
renovación 7 días de forma predeterminada. Ambos viajan en cookies HttpOnly; en producción las
cookies son `Secure` y `SameSite=Strict`. Cada renovación rota la sesión y revoca el token
anterior. Cambios de contraseña, estado o roles invalidan las sesiones existentes.

La autorización consulta roles y permisos vigentes en cada petición protegida. Los eventos de
login, logout, contraseñas y administración de usuarios quedan registrados en `audit_logs`.
