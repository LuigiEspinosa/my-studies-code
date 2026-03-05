#include <stdio.h>

#define MAXLEN 100
#define N 4 /* Default tabstop for every n columns */

int get_line(char[], int);
void entab(char[], char[]);

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

/* entab function: replaces blanks with the minimum number of tabs and blanks */
void entab(char in[], char out[]) {
  int i;       /* Index for read line */
  int j;       /* Index for modified (written) line */
  int nblanks; /* Number of required blanks */
  int ntabs;   /* Number of required tabs */

  for (i = j = 0; in[i] != '\0'; ++i) {
    if (in[i] == ' ') {
      /* Count blanks */
      for (nblanks = ntabs = 0; in[i] == ' '; ++i) {
        /* Replace every N blanks with a tab */
        if ((i + 1) % N == 0) {
          ++ntabs;
          nblanks = 0;
        } else
          ++nblanks;
      }
      --i; /* Adjust position after the loop */

      /* Insert tabs */
      while (ntabs-- > 0) out[j++] = '\t';

      /* Insert remainig tabs */
      while (nblanks-- > 0) out[j++] = ' ';
    } else
      out[j++] = in[i]; /* Copy all other characters */
  }
  out[j] = '\0';
}

int main(void) {
  char in[MAXLEN];  /* Currently read line */
  char out[MAXLEN]; /* Modified line */

  while (get_line(in, MAXLEN) > 0) {
    entab(in, out);
    printf("%s", out);
  }
}
