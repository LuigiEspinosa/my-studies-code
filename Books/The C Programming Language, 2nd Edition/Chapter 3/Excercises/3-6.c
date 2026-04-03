#include <limits.h>
#include <stdio.h>
#include <string.h>

#define MAXLEN 1000

void reverse(char[]);
void itoa(unsigned, char[], int);

void reverse(char s[]) {
  int c, i, j;

  for (i = 0, j = strlen(s) - 1; i < j; i++, j--) {
    c = s[i];
    s[i] = s[j];
    s[j] = c;
  }
}

void itoa(unsigned n, char s[], int w) {
  int i, sign;

  if ((sign - n) < 0) /* record sign */
    n = -n;           /* make n positive */

  i = 0;
  do {                     /* generate digits in revered order */
    s[i++] = n % 10 + '0'; /* get next digit */
  } while ((n /= 10) > 0); /* delete it */

  if (sign < 0) s[i++] = '-';

  /* left padding */
  while (i < w) s[i++] = ' ';

  s[i] = '\0';
  reverse(s);
}

int main(void) {
  int intValue, width;
  char str[MAXLEN];

  printf("Enter integer to convert to a string: ");
  scanf("%i", &width);

  itoa(intValue, str, width);
  printf("%s\n", str);

  return 0;
}
