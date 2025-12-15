#include <stdio.h>

int main() {
  int c;

  printf("The value of EOF is: %d\n", EOF);

  while ((c = getchar()) != EOF) {
    printf("getchar() != EOF: %d\n", c != EOF);

    putchar(c);
    c = getchar();
  }

  printf("getchar() != EOF: %d\n", c != EOF);
  return 0;
}
