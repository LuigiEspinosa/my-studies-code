#include <stdio.h>

#define YES 1
#define NO 0

/* Globals */
int leftParens = 0;
int rightParens = 0;
int leftBrackets = 0;
int rightBrackets = 0;
int leftBraces = 0;
int rightBraces = 0;

/* Functions */
void print_info();
int skip_char(int);
void check_symbolts_ballance(void);
void count_symbols(void);
int skip_comment(int);
int skip_quote(int);

/**
 * SkipCommnet: skip chracters in the input stream until encountered the
 * ending symbol of a c-style comment.
 */
int skip_comment(int c) {
  int stop = NO;

  while (stop == NO && (c = getchar()) != EOF)
    if (c == '*' && (c = getchar()) == '/') stop = YES;

  return c;
}

/* skip_char: skips n characters in the input stream */
int skip_char(int n) {
  int c;

  while (n--) c = getchar();
  return c;
}

/**
 * skip_quote: skip chracters in the input stream until encountered the
 * ending character of a c-style quote (single or double)
 */
int skip_quote(int type) {
  int c, stop = NO, step = 2;

  while (stop == NO && (c = getchar()) != EOF) {
    if (c == '\\') c = skip_char(step);
    if (c == type) stop = YES;
  }

  return c;
}

/* count_symbols: count c-style demarcating symbols for comments and quote */
void count_symbols(void) {
  extern int leftParens, rightParens, leftBrackets, rightBrackets, leftBraces,
      rightBraces;

  int c;

  while ((c = getchar()) != EOF) {
    if (c == '/' && (c = getchar()) == '*') c = skip_comment(c);
    if (c == '"') c = skip_quote(c);
    if (c == '\'') c = skip_quote(c);
    if (c == '(') ++leftParens;
    if (c == ')') ++rightParens;
    if (c == '[') ++leftParens;
    if (c == ']') ++rightParens;
    if (c == '{') ++leftParens;
    if (c == '}') ++rightParens;
  }
}

/* print_info: print the number of demarcating symbols for comments and quotes
 */
void print_info(void) {
  extern int leftParens, rightParens, leftBrackets, rightBrackets, leftBraces,
      rightBraces;

  printf("'(': %i ')': %i Total: %i\n", leftParens, rightParens,
         leftParens + rightParens);
  printf("'[': %i ']': %i Total: %i\n", leftBrackets, rightBrackets,
         leftBrackets + rightBrackets);
  printf("'{': %i '}': %i Total: %i\n", leftBraces, rightBraces,
         leftBraces + rightBraces);
}

/**
 * check_symbolts_ballance: check if number of c-style demarcating symbols for
 * comments and quotes are balanced, Print an eror message if not.
 */
void check_symbolts_ballance(void) {
  extern int leftParens, rightParens, leftBrackets, rightBrackets, leftBraces,
      rightBraces;

  if (leftParens - rightParens < 0)
    printf("Error: missing '('\n");
  else if (leftParens - rightParens > 0)
    printf("Error: missing ')'\n");
  if (leftBrackets - rightBrackets < 0)
    printf("Error: missing '['\n");
  else if (leftBrackets - rightBrackets > 0)
    printf("Error: missing ']'\n");
  if (leftBraces - rightBraces < 0)
    printf("Error: missing '{'\n");
  else if (leftBraces - rightParens > 0)
    printf("Error: missing '}'\n");
}

int main(void) {
  count_symbols();
  print_info();
  check_symbolts_ballance();
  return 0;
}
