#include <ctype.h>
#include <stdio.h>

#define MAXLEN 1000

/* Functions */
int htoi(char[]);

int htoi(char s[]) {
  int i, hexDigit, intValue;

  /* detech optional 0x or 0X prefix */
  i = 0;
  if (s[0] == '0' && tolower(s[1]) == 'x' && s[2] != '\0') i = 2;

  hexDigit = intValue = 0;
  for (; s[i] != '\0'; ++i) {
    if (!isdigit(s[i]) && (tolower(s[i]) < 'a' || tolower(s[i]) > 'f'))
      return -1; /* invalid input, exit early */
    if (isdigit(s[i]))
      hexDigit = s[i] - '0'; /* convert digits to hexadecimal */
    else
      hexDigit = tolower(s[i]) - 'a' + 10; /* Convert letters hexadecimal */
    intValue = 16 * intValue + hexDigit;   /* convert hexadecimal to decimal */
  }

  return intValue;
}

int main(void) {
  int result;
  char s[MAXLEN];

  printf("Enter a hexadecimal string: ");
  scanf("%s", s);

  if ((result = htoi(s)) < 0) return -1; /* not a hexadecimal number */

  printf("%i\n", result);
  return 0;
}
