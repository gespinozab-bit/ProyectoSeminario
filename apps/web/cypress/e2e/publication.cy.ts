/// <reference types="cypress" />
/* global cy, describe, it, beforeEach, expect */

import type { Interception } from 'cypress/types/net-stubbing';

interface TestData {
  moduleId: string;
  contentId: string;
}

const api = 'http://127.0.0.1:3101';
const get = (name: string) => cy.get(`[data-cy="${name}"]`);
const row = () =>
  get('content-row').contains('h2', 'La vocal A').closest('[data-cy="content-row"]');

function waitForResponse(alias: `@${string}`): Cypress.Chainable<Interception> {
  return cy.wait<unknown, unknown>(alias).then((interception) => {
    // StrictMode puede cancelar el primer fetch al repetir el efecto en desarrollo.
    // Esperar la respuesta siguiente conserva los timeouts de red de Cypress.
    return interception.response ? cy.wrap(interception, { log: false }) : waitForResponse(alias);
  });
}

function login() {
  cy.intercept('POST', `${api}/api/auth/login`).as('login');
  cy.visit('/admin/login');
  get('login-email').type('admin@e2e.lensegua.test');
  cy.task<string>('auth:adminPassword', null, { log: false }).then((password) => {
    get('login-password').type(password, { log: false });
  });
  get('login-submit').click();
  cy.wait('@login').its('response.statusCode').should('eq', 200);
  cy.location('pathname').should('eq', '/admin');
  get('admin-user').should('contain.text', 'ADMINISTRADOR');
}

function openContents() {
  cy.intercept('GET', `${api}/api/contents?*`).as('contents');
  get('nav-contents').click();
  waitForResponse('@contents').its('response.statusCode').should('be.oneOf', [200, 304]);
  get('contents-page').should('be.visible');
  row().should('be.visible');
}

function attachMedia() {
  row().find('[data-cy="edit-content"]').click();
  get('content-title').should('have.value', 'La vocal A');
  // El input nativo está oculto por diseño dentro de la zona de carga.
  get('media-upload').selectFile('cypress/fixtures/vocal-a.png', { force: true });
  get('media-success').should('be.visible').and('contain.text', 'guardado correctamente');
  get('media-resource').should('have.length', 1).and('be.visible');
  // Volver al listado solo después de terminar la carga y su confirmación visible.
  get('nav-contents').click();
  row().should('be.visible');
}

function publish() {
  cy.intercept('PATCH', `${api}/api/contents/*/status`).as('publish');
  row().find('[data-cy="publish-content"]').click();
  cy.wait('@publish').then(({ request, response }) => {
    expect(request.body.status).to.eq('PUBLISHED');
    expect(response?.statusCode).to.eq(200);
  });
  row().find('[data-cy="content-status"]').should('have.text', 'Publicado');
}

function preparePublished() {
  login();
  openContents();
  attachMedia();
  publish();
}

function visitStudentModule(data: TestData) {
  cy.clearCookies();
  cy.intercept('GET', `${api}/api/public/modules/${data.moduleId}`).as('studentModule');
  cy.visit(`/aprender/${data.moduleId}`);
  waitForResponse('@studentModule').its('response.statusCode').should('be.oneOf', [200, 304]);
  get('student-lessons').should('be.visible');
}

describe('Publicación de contenido educativo', () => {
  beforeEach(() => {
    cy.task<TestData>('db:reset', null, { timeout: 60000 }).as('data');
    cy.on('window:confirm', () => true);
  });

  it('01 inicia sesión correctamente como administrador', () => {
    login();
  });

  it('02 rechaza credenciales incorrectas', () => {
    cy.intercept('POST', `${api}/api/auth/login`).as('invalidLogin');
    cy.visit('/admin/login');
    get('login-email').type('admin@e2e.lensegua.test');
    get('login-password').type('Incorrecta-Solo-E2E!123', { log: false });
    get('login-submit').click();
    cy.wait('@invalidLogin').its('response.statusCode').should('eq', 401);
    get('login-error').should('be.visible').and('contain.text', 'Invalid email or password');
    cy.location('pathname').should('eq', '/admin/login');
    get('admin-user').should('not.exist');
  });

  it('03 permite acceder al módulo de contenidos', () => {
    login();
    openContents();
    cy.location('pathname').should('eq', '/admin/contenidos');
    get('new-content').should('be.visible');
    row().find('[data-cy="content-status"]').should('have.text', 'Borrador');
  });

  it('04 impide guardar un formulario sin título obligatorio', () => {
    login();
    openContents();
    get('new-content').click();
    get('content-title').should('have.value', '');
    // Módulo y orden tienen valores iniciales; el título vacío debe bloquear el submit nativo.
    cy.window().then((window) => {
      const submit = cy.stub().as('submit');
      window.document.querySelector('[data-cy="content-form"]')!.addEventListener('submit', submit);
    });
    get('save-draft').click();
    get('content-title')
      .should(($input) => {
        const input = $input[0] as HTMLInputElement;
        expect(input.validity.valueMissing).to.eq(true);
        expect(input.validationMessage).not.to.eq('');
        expect(input.matches(':invalid')).to.eq(true);
      })
      .and('be.focused');
    cy.get('@submit').should('not.have.been.called');
    cy.location('pathname').should('eq', '/admin/contenidos/nuevo');
  });

  it('05 crea un contenido educativo como borrador', () => {
    login();
    openContents();
    get('new-content').click();
    get('content-title').type('La vocal E');
    get('content-body').type('Observa y practica la vocal E.');
    get('content-order').clear().type('2');
    cy.intercept('POST', `${api}/api/contents`).as('createDraft');
    get('save-draft').click();
    cy.wait('@createDraft').then(({ response }) => {
      expect(response?.statusCode).to.eq(201);
      expect(response?.body.content.status).to.eq('DRAFT');
    });
    cy.location('pathname').should('eq', '/admin/contenidos');
    get('content-row')
      .contains('h2', 'La vocal E')
      .closest('[data-cy="content-row"]')
      .find('[data-cy="content-status"]')
      .should('have.text', 'Borrador');
  });

  it('06 publica un borrador con texto e imagen activa', () => {
    preparePublished();
    row().find('[data-cy="publish-content"]').should('not.exist');
  });

  it('07 muestra el mensaje de éxito al publicar', () => {
    preparePublished();
    get('content-success')
      .should('be.visible')
      .and('have.text', 'Estado actualizado correctamente.');
  });

  it('08 muestra el contenido publicado al estudiante sin sesión', () => {
    preparePublished();
    cy.get<TestData>('@data').then((data) => {
      visitStudentModule(data);
      cy.intercept(
        'GET',
        `${api}/api/public/modules/${data.moduleId}/lessons/${data.contentId}`,
      ).as('lesson');
      get('student-lessons').contains('a', 'La vocal A').click();
      waitForResponse('@lesson').its('response.statusCode').should('be.oneOf', [200, 304]);
      get('student-lesson-title').should('be.visible').and('have.text', 'La vocal A');
      get('student-lesson-body').should('contain.text', 'Aprendemos la vocal A.');
    });
  });

  it('09 desactiva el contenido y deja de mostrarlo al estudiante', () => {
    preparePublished();
    cy.get<TestData>('@data').then((data) => {
      visitStudentModule(data);
      get('student-lessons').contains('a', 'La vocal A').should('be.visible');
      login();
      openContents();
      cy.intercept('PATCH', `${api}/api/contents/*/status`).as('deactivate');
      row().find('[data-cy="deactivate-content"]').click();
      cy.wait('@deactivate').then(({ request, response }) => {
        expect(request.body.status).to.eq('INACTIVE');
        expect(response?.statusCode).to.eq(200);
      });
      row().find('[data-cy="content-status"]').should('have.text', 'Inactivo');
      visitStudentModule(data);
      get('student-lessons').should('not.contain.text', 'La vocal A');
      get('student-lessons').should('contain.text', 'Las lecciones están en camino');
      cy.intercept(
        'GET',
        `${api}/api/public/modules/${data.moduleId}/lessons/${data.contentId}`,
      ).as('hiddenLesson');
      cy.visit(`/aprender/${data.moduleId}/${data.contentId}`);
      waitForResponse('@hiddenLesson').its('response.statusCode').should('eq', 404);
      get('portal-load-state')
        .should('be.visible')
        .and('have.attr', 'role', 'alert')
        .and('contain.text', 'Este material ya no está disponible');
    });
  });

  it('10 muestra un error visible si falla la carga de contenidos', () => {
    login();
    cy.intercept('GET', `${api}/api/contents?*`, {
      statusCode: 503,
      body: { error: 'No fue posible cargar los contenidos. Intenta nuevamente.' },
    }).as('contentsFailure');
    get('nav-contents').click();
    waitForResponse('@contentsFailure').its('response.statusCode').should('eq', 503);
    get('contents-error')
      .should('be.visible')
      .and('contain.text', 'No fue posible cargar los contenidos');
  });
});
