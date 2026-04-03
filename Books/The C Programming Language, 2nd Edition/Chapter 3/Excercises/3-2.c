#include <stdio.h>

#define MAXLEN 1000 /* maximum input line length */

int getLine(char[], int);
void escape(char[], char[]);
void escapeToChar(char[], char[]);

int getLine(char s[], int lim) {
  int c, i;

  for (i = 0; i < lim - 1 && (c = getchar()) != EOF && c != '\n'; ++i) s[i] = c;
  if (c == '\n') s[i++] = c;
  s[i] = '\0';
  return i;
}

/* escape: copy string t to s and convert characters like newline and tab into
 * visible escape sequences */
void escape(char s[], char t[]) {
  int i, j;

  for (i = j = 0; t[i] != '\0'; ++i, ++j) switch (t[i]) {
      case '\t':
        s[j] = '\\';
        s[++j] = 't';
        break;
      case '\n':
        s[j] = '\\';
        s[++j] = 'n';
        break;
      default:
        s[j] = t[i];
        break;
    }
  s[j] = '\0';
}

/* escapeRev: copy string t to s and convert escape sequences like \n and \t
 * into newline and tab characters */
void escapeToChar(char s[], char t[]) {
  int i, j;

  for (i = j = 0; t[i] != '\0'; ++i, ++j) switch (t[i]) {
      case '\\':
        switch (t[++i]) {
          case 't':
            s[j] = '\t';
            break;
          case 'n':
            s[j] = '\n';
            break;
          default:
            s[j] = t[i];
            break;
        }
        break;
      default:
        s[j] = t[i];
        break;
    }
  s[j] = '\0';
}

int main(void) {
  char line[MAXLEN], modLine[MAXLEN];

  while (getLine(line, MAXLEN) > 0) {
    escape(modLine, line);
    printf("%s", modLine);
    // escapeToChar(modLine, line);
    // printf("%s", modLine);
  }
  return 0;
}
