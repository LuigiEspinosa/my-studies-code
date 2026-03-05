#include <stdio.h>

#define MAXLEN 1000 /* Maximum input line length */

/* Number of characters per line, including the newline character */
#define NCHARS 80

int get_line(char[], int);

/* get_line function: read a line into s, return length */
int get_line(char s[], int lim) {
  int c, i;

  for (i = 0; i < lim - 1 && (c = getchar()) != EOF && c != '\n'; ++i) s[i] = c;

  if (c == '\n') {
    s[i] = c;
    ++i;
  }

  s[i] = '\0';
  return i;
}

int main(void) {
  int len;           /* Current line length */
  char line[MAXLEN]; /* Current input line */

  while ((len = get_line(line, MAXLEN)) > 0)
    if (len > NCHARS) printf("%s", line);

  return 0;
}
