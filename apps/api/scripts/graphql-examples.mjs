import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Ejemplos con escrituras: exclusivamente el servidor temporal e2e:start.
if (process.env.NODE_ENV !== 'test' || process.env.LENSEGUA_E2E !== '1') {
  throw new Error('Ejecuta los ejemplos únicamente con NODE_ENV=test y LENSEGUA_E2E=1.');
}
const secret = process.env.E2E_ADMIN_PASSWORD;
if (!secret)
  throw new Error(
    'Configura E2E_ADMIN_PASSWORD con el mismo valor exclusivo de pruebas del servidor temporal.',
  );
const origin = 'http://127.0.0.1:3101';
const login = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@e2e.lensegua.test', password: secret }),
});
assert.equal(login.status, 200, 'El acceso al entorno temporal fue rechazado.');
const values = login.headers.getSetCookie().map((value) => value.split(';')[0]);
const token = values
  .find((value) => value.startsWith('lensegua_access='))
  ?.slice('lensegua_access='.length);
assert.ok(token, 'No se recibió la cookie de acceso.');
const cookie = values.join('; ');
async function graph(query, variables = {}, authenticated = true) {
  const response = await fetch(`${origin}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  assert.equal(response.status, 200, 'Respuesta HTTP inesperada de GraphQL.');
  return response.json();
}
function show(label, result) {
  console.log(`${label}\n${JSON.stringify(result, null, 2)}`);
}

const info = await graph('{systemInfo{name version status}}', {}, false);
assert.equal(info.data.systemInfo.status, 'OK');
show('Consulta pública systemInfo', info);
const catalog = await graph(
  '{modules(search:"Vocales",active:true,page:1,pageSize:10){items{id name contents{title}} pagination{page pageSize total pages}}}',
  {},
  false,
);
assert.ok(catalog.data.modules.items.length, 'Falta Vocales; inicia un entorno e2e:start nuevo.');
show('Módulos, filtros, paginación y relación', catalog);
const module = catalog.data.modules.items[0];
let order = 0;
for (let page = 1; ; page++) {
  const response = await fetch(
    `${origin}/api/contents?moduleId=${module.id}&page=${page}&pageSize=50`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  for (const item of result.contents) order = Math.max(order, item.sortOrder + 1);
  if (page >= result.pagination.pages) break;
}
const created = await graph(
  'mutation($input:CreateEducationalContentInput!){createEducationalContent(input:$input){id title status}}',
  {
    input: {
      moduleId: module.id,
      title: `Ejemplo GraphQL ${Date.now()}`,
      description: 'Ejemplo temporal',
      content: 'Observa y practica la vocal A.',
      order,
    },
  },
);
assert.equal(created.data.createEducationalContent.status, 'DRAFT');
show('Crear borrador con Bearer', created);
const id = created.data.createEducationalContent.id;
const updated = await graph(
  'mutation($id:ID!){updateEducationalContent(id:$id,input:{description:"Descripción revisada"}){id description status}}',
  { id },
);
assert.equal(updated.data.updateEducationalContent.description, 'Descripción revisada');
show('Actualizar contenido', updated);

// REST conserva cookies: el mismo JWT Bearer no se habilita para sus endpoints.
const form = new FormData();
form.append(
  'file',
  new Blob([await readFile(new URL('../../web/cypress/fixtures/vocal-a.png', import.meta.url))], {
    type: 'image/png',
  }),
  'vocal-a.png',
);
const upload = await fetch(`${origin}/api/contents/${id}/media`, {
  method: 'POST',
  headers: { Cookie: cookie },
  body: form,
});
assert.equal(upload.status, 201, 'No se pudo preparar la imagen de prueba por REST.');
const publish = 'mutation($id:ID!){publishEducationalContent(id:$id){id status updatedAt}}';
const first = await graph(publish, { id });
assert.equal(first.data.publishEducationalContent.status, 'PUBLISHED');
assert.deepEqual((await graph(publish, { id })).data, first.data);
show('Publicación idempotente', first);
const visible = await graph(
  'query($id:ID!){content(id:$id){id title status module{name} createdAt updatedAt}}',
  { id },
  false,
);
assert.ok(visible.data.content);
show('Lectura pública del contenido publicado', visible);
const moduleUpdate = await graph(
  'mutation($id:ID!){updateEducationalModule(id:$id,input:{active:true}){id name active}}',
  { id: module.id },
);
assert.equal(moduleUpdate.data.updateEducationalModule.active, true);
show('Actualizar módulo como administrador', moduleUpdate);
const inactive = await graph('mutation($id:ID!){deactivateEducationalContent(id:$id){id status}}', {
  id,
});
assert.equal(inactive.data.deactivateEducationalContent.status, 'INACTIVE');
show('Desactivar sin eliminación', inactive);
const hidden = await graph('query($id:ID!){content(id:$id){id}}', { id }, false);
assert.equal(hidden.errors[0].extensions.code, 'CONTENT_NOT_FOUND');
show('Contenido desactivado oculto al público', hidden);
const invalid = await graph(
  'mutation($input:CreateEducationalContentInput!){createEducationalContent(input:$input){id}}',
  { input: { moduleId: module.id, title: '', order: order + 1 } },
);
assert.equal(invalid.errors[0].extensions.code, 'BAD_USER_INPUT');
show('Rechazo de datos inválidos', invalid);
const unauthenticated = await graph(publish, { id }, false);
assert.equal(unauthenticated.errors[0].extensions.code, 'UNAUTHENTICATED');
show('Rechazo de escritura pública', unauthenticated);
console.log('Ejemplos GraphQL: OK');
