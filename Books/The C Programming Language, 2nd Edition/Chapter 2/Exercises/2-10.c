#include <stdio.h>

int lower(char);

int lower(char c) { return (c >= 'A' && c <= 'Z') ? c + 'a' - 'A' : c; }

int main(void) {
  char c;

  while ((c = getchar()) != EOF) printf("%c", lower(c));
  return 0;
}
