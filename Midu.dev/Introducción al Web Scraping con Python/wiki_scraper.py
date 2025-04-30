from bs4 import BeautifulSoup
import requests
from time import sleep
from urllib.parse import urljoin


def scrape_url(url: str):
  response = requests.get(url)

  if response.status_code == 200:
    print('La petición fue exitosa')

    soup = BeautifulSoup(response.text, 'html.parser')

    # # Extraer todos los titulos <h1>
    # titulos = [titulo.string for titulo in soup.find_all('h1')]
    # print(titulos)

    # # Extraer todos los enlaces <a>
    # enlaces = [urljoin(url, enlace.get('href')) for enlace in soup.find_all('a')]
    # print(enlaces)
    # # for enlace in enlaces:
    # #   scrape_url(enlace)
    # #   sleep(1)

    # # Extraer todo el contenido de la web.
    # # all_text = soup.get_text()
    # # print(all_text)
    # main_text = soup.find('main').get_text()
    # print(main_text)

    # # Extraer de la id mw-content-text
    # content_text = soup.find('div', {'id': 'mw-content-text'}).get_text()
    # print(content_text)

    # Extraer el open graph si existe
    # og_image = soup.find('meta', {'property': 'og:image'})
    og_image = soup.find('meta', property='og:image')
    print(og_image['content'])


# scrape_url('https://en.wikipedia.org/wiki/Web_scraping')
scrape_url('https://midu.dev')
