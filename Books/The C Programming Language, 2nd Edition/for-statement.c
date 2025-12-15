#include <stdio.h>

int main() {
  int fahr;

  printf("\n");
  printf("Fahrenheit-Celsius Table\n");
  printf("\n");

  for (fahr = 0; fahr <= 300; fahr += 20) {
    printf("%3d %6.1f\n", fahr, (5.0/9.0) * (fahr-32));
  }

  printf("\n");
  printf("Fahrenheit-Celsius Table Backwards\n");
  printf("\n");
  
  for (fahr = 300; fahr >= 0; fahr -= 20) {
    printf("%3d %6.1f\n", fahr, (5.0/9.0) * (fahr-32));
  }
}
