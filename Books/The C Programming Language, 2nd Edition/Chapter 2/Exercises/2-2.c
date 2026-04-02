#include <stdio.h>

#define MAXLINE 1000 /* Maximum input line length */

/* Functions */
int getLine(char[], int);

/* getLine function: read a line into s, return length */
int getLine(char s[], int lim) {
  int c, i, halt;

  halt = 0;
  for (i = 0; !halt; ++i) {
    if ((i > lim - 1) || ((c = getchar()) == '\n') || (c == EOF))
      halt = 1;
    else
      s[i] = c;
  }
  --i;

  if (c == '\n') s[i++] = c;

  s[i] = '\0';

  return i;
}

int main(void) {
  char line[MAXLINE];

  while (getLine(line, MAXLINE) > 0) printf("%s", line);

  return 0;
}
