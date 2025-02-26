describe('Ask question', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('When signed in and ask a valid question, the question should successfully save', () => {
    cy.contains('Q & A');
    cy.contains('Unanswered Questions');

    // TODO: Auth0 Authentication -> https://docs.cypress.io/app/guides/authentication-testing/auth0-authentication
    // cy.contains('Sign In').click();
    // cy.url().should('include', 'auth0');

    // cy.find('#username')
    //   .type('luigi@cuatro.dev')
    //   .should('have.value', 'luigi@cuatro.dev');

    // cy.find('#password').type('TestAuth0!').should('have.value', 'TestAuth0!');

    // cy.get('form').submit();
    // cy.contains('Unanswered Questions');

    cy.contains('Ask a question').click();
    cy.contains('Ask a Question');

    var title = 'title test';
    var content = 'Lots and lots and lots and lots and lots of content test';
    cy.find('Title').type(title).should('have.value', title);
    cy.find('Content').type(content).should('have.value', content);

    cy.contains('Submit Your Question').click();
    cy.contains('Your question was successfully submitted');

    cy.contains('Sign Out').click();
    cy.contains('You successfully signed out!');
  });
});
