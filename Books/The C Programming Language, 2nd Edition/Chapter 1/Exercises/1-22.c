#include <stdio.h>

#define MAXLEN 1000 /* Maximum input line length */
#define LIMIT 79    /* Maximum output line lenght */

int get_line(char[], int);
int skip_blanks(char[], int);
void fold_line(char[], char[], int);

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

int skip_blanks(char str[], int pos) {
  while (str[pos] == ' ' || str[pos] == '\t') ++pos;
  return --pos;
}

/**
 * fold_line function: Breaks line to a specified length limit and stores
 * results in ouput
 */
void fold_line(char line[], char output[], int limit) {
  int i;         /* Position of currently read char */
  int nChar;     /* Number of chars read from each fold point */
  int lastBlank; /* Position of the last whitespace */
  int inBlank;

  nChar = lastBlank = inBlank = 0;
  for (i = 0; line[i] != '\0'; ++i) {
    output[i] = line[i];
    ++nChar;

    if (line[i] == ' ' || line[i] == '\t') {
      if (!inBlank) lastBlank = i; /* Keep track of blank position */
      inBlank = 1;
    } else
      inBlank = 0;

    /* Slip if no lastBlank */
    if (nChar >= limit && lastBlank != 0) {
      output[lastBlank] = '\n'; /* Break line (foldpoint) */
      i = lastBlank;            /* Read next character from foldpoint */
      i = skip_blanks(line, i); /* Consume leading blanks after foldpoint */
      nChar = lastBlank = inBlank = 0; /* Rest */
    }
  }

  output[i] = '\0';
}

int main(void) {
  int len;                 /* Current line length */
  char line[MAXLEN];       /* Current input line */
  char foldedLine[MAXLEN]; /* Folded input line */

  while ((len = get_line(line, MAXLEN)) > 0) {
    if (len > LIMIT) {
      fold_line(line, foldedLine, LIMIT);
      printf("%s", foldedLine);
    } else
      printf("%s", line);
  }
  return 0;
}
