#include <stdio.h>

#define MAXLINE 1000 /* Maximum input line length */

int get_line(char[], int);
void reverse(char[]);

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

/* reverse: reverses s's charaters in-place. */
void reverse(char s[]) {
  int i, j, len, temp;

  len = 0;
  for (i = 0; s[i] != '\0'; ++i) ++len;

  for (i = 0, j = len - 1; i < len / 2; ++i, --j) {
    temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
}

int main(void) {
  int len;            /* Current line length */
  char line[MAXLINE]; /* Current input line */

  while ((len = get_line(line, MAXLINE)) > 0) {
    /* Remove newline character at the end */
    line[--len] = '\0';

    reverse(line);
    printf("%s\n", line);
  }

  return 0;
}
