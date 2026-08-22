from playwright.sync_api import sync_playwright

url = 'https://midu.dev'

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True) # slow_mo=2000

  page = browser.new_page()
  page.goto(url)
  page.wait_for_load_state('networkidle')

  first_article_anchor = page.locator('article a').first
  first_article_anchor.click()
  page.wait_for_load_state()

  first_image = page.locator('main img').first
  image_src = first_image.get_attribute('src')
  print(f"La imagen del primer curso es: {image_src}")

  # first_image = page.locator('xpath=/html/body/div[1]/main/div[1]/img')
  # print(first_image.get_attribute('src'))

  curso_content_container = page.locator('text="Contenido del curso"')
  curso_content_sibling = curso_content_container.locator('xpath=./div/')

  browser.close()
