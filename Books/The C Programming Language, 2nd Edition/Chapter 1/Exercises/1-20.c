#include <stdio.h>

#define MAXLEN 1000
#define N 4

int get_line(char[], int);

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

void detab(char in[], char out[]) {
  int i;       /* Index for read line. */
  int j;       /* Index for modified (written) line */
  int nblanks; /* Number of blanks to the next tab stop */

  for (i = j = 0; in[i] != '\0'; ++i)
    if (in[i] == '\t') {
      nblanks = N - (j % N);
      while (nblanks-- > 0) out[j++] = ' ';
    } else
      out[j++] = in[i];

  out[j] = '\0';
}

int main(void) {
  char in[MAXLEN];
  char out[MAXLEN];

  while (get_line(in, MAXLEN) > 0) {
    detab(in, out);
    printf("%s", out);
  }
  return 0;
}
