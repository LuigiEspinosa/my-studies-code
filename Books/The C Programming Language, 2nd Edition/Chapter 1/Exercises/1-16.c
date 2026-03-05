#include <stdio.h>

#define MAXLEN 1000 /* Maximum input line length */

int get_line(char[], int);
void copy(char[], char[]);

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

/* copy function: copy 'from' into 'to'; assume to is big enough */
void copy(char to[], char from[]) {
  int i;

  i = 0;
  while ((to[i] = from[i]) != '\0') ++i;
}

int main(void) {
  int len;               /* Current line length */
  int nextLen;           /* Next line length */
  int max;               /* Maximum length seen so far */
  char line[MAXLEN];     /* Current input line */
  char nextLine[MAXLEN]; /* Next input line */
  char longest[MAXLEN];  /* Longest line saved here */

  max = 0;
  while ((len = get_line(line, MAXLEN)) > 0) {
    /* Is line longer than buffer size? */
    if (len == MAXLEN - 1) {
      line[MAXLEN - 1] = '\n';
      nextLen = len;

      /* Find the line's length */
      while (nextLen == MAXLEN - 1) {
        nextLen = get_line(nextLine, MAXLEN);
        len += nextLen;
      }
    }

    if (len > max) {
      max = len;
      copy(longest, line);
    }
  }

  /* There was a line */
  if (max > 0) printf("%s -> %i\n", longest, max);

  return 0;
}
