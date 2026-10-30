/// <reference types="cypress" />
/* global cy, describe, it, before */

describe('Página principal', () => {
  before(() => {
    cy.task('db:reset', null, { timeout: 60000 });
  });

  it('carga y muestra LENSEGUA', () => {
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.get('header').contains('a', 'LENSEGUA').should('be.visible');
  });
});
