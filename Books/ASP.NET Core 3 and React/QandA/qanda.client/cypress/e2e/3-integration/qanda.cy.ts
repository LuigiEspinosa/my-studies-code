describe('Ask question', () => {
  beforeEach(() => {
    cy.loginToAuth0(
      Cypress.env('auth0_username'),
      Cypress.env('auth0_password'),
    );

    cy.visit('/');
  });

  it('When signed in and ask a valid question, the question should successfully save', () => {
    cy.contains('Q & A');
    cy.contains('Unanswered Questions');

    cy.contains('Ask a Question').click();
    cy.contains('Ask a Question');

    var title = 'title test';
    var content = 'Lots and lots and lots and lots and lots of content test';
    cy.get('input#title').type(title).should('have.value', title);
    cy.get('textarea#content').type(content).should('have.value', content);

    cy.contains('Submit Your Question').click();
    cy.contains('Your question was successfully submitted');

    cy.contains('Sign Out').click();
    cy.contains('You successfully signed out!');
  });
});
