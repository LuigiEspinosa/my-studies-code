#include <stdio.h>

#define MAXLINE 1000 /* Maximum input line length */

int get_line(char[], int);
int right_trim(char[], int);

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

int right_trim(char s[], int len) {
  int nw = 0;

  if (s[--len] == '\n') {
    s[len] = '\0'; /* Remove newline character */
    nw = 1;        /* Set flag */
  }

  while (--len >= 0 && (s[len] == ' ' || s[len] == '\t')) s[len] = '\0';
  ++len;

  if (nw) s[len] = '\n'; /* Add back the newline character */
  return ++len;
}

int main(void) {
  int len;            /* Current line length */
  char line[MAXLINE]; /* Current input line */

  while ((len = get_line(line, MAXLINE)) > 0) {
    len = right_trim(line, len);

    /* Delete if line is empty */
    if (len == 1 && line[0] == '\n') line[0] = '\0';
    printf("%s", line);
  }

  return 0;
}
