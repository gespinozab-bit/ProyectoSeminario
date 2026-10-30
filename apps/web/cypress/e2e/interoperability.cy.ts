/// <reference types="cypress" />
/* global cy, describe, it, before, expect */

const api = 'http://127.0.0.1:3101';
describe('Coexistencia de REST, GraphQL y portal', () => {
  before(() => cy.task('db:reset', null, { timeout: 60000 }));
  it('consulta el mismo catálogo por REST y GraphQL y abre el portal', () => {
    cy.request(`${api}/api/health`).its('body.database').should('eq', 'connected');
    cy.request(`${api}/api/public/modules`).then(({ body: rest }) => {
      cy.request('POST', `${api}/graphql`, {
        query: '{ systemInfo { name status } modules { items { id name contents { id } } } }',
      }).then(({ status, body }) => {
        expect(status).to.eq(200);
        expect(body.errors).to.eq(undefined);
        expect(body.data.systemInfo).to.deep.eq({ name: 'LENSEGUA', status: 'OK' });
        expect(body.data.modules.items.map((item: { id: string }) => item.id)).to.deep.eq(
          rest.modules.map((item: { id: string }) => item.id),
        );
        expect(body.data.modules.items[0].name).to.eq('Vocales');
        expect(body.data.modules.items[0].contents).to.deep.eq([]);
        expect(rest.modules[0].lessonCount).to.eq(0);
      });
    });
    cy.visit('/');
    cy.get('[data-cy="student-module"]').should('be.visible').and('contain.text', 'Vocales');
  });
});
