#include <stdio.h>

#define IN 1
#define OUT 0

/**
 * is_quotation_mark: return true if c is a valid beginning (or end)
 * of a tring literal, otherwise return 0
 */
int is_quotation_mark(char prev, char c) {
  return prev != '\\' && prev != '\'' && c == '\"';
}

int main(void) {
  int prevC; /* Previously read character from input */
  int c;     /* Currently read character from input */
  int comment, quote;

  comment = quote = OUT;
  prevC = getchar(); /* Get the first character */

  /* Get the next character */
  while ((c = getchar()) != EOF) {
    if (is_quotation_mark(prevC, c)) {
      if (quote == IN)
        quote = OUT; /* The end of quote */
      else if (comment == OUT)
        quote = IN; /* The beginning of a quote */
    }

    if (quote == OUT && prevC == '/' && c == '*')
      comment = IN; /* The beginning of a comment */

    if (comment == OUT) putchar(prevC); /* Print previously read character */

    if (comment == IN && prevC == '*' && c == '/') {
      c = getchar(); /* Skip '/' character */
      comment = OUT; /* The end of a comment */
    }

    prevC = c; /* Store c */
  }

  putchar(prevC);
  return 0;
}
