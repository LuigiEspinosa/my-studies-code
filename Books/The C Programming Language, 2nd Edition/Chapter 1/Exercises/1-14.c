#include <stdio.h>

#define SIZE 93 /* Size of characters array */
#define SCALE 1 /* Adjust to accommodate large input */

int main(void) {
  int c, i, j, count;
  int characters[SIZE];

  /* Initialize elements' values to 0 */
  for (i = 0; i < SIZE; ++i) characters[i] = 0;

  count = 0;
  while ((c = getchar()) != EOF)
    if (c >= '!' && c <= '~') { /* Graphical characters only (ASCII table) */
      ++characters[c - '!'];
      ++count; /* Number of matched characters */
    }

  if (!count) return -1;

  printf("\nHorizontal Histogram: (scale 1:%i)\n", SCALE);
  for (i = 0; i < SIZE; ++i)
    if (characters[i] != 0) { /* Skip if no data */
      printf(" %c", i + '!'); /* Labels */
      for (j = 1; j <= characters[i] / SCALE; ++j) printf(" *");
      printf("\n");
    }

  return 0;
}
