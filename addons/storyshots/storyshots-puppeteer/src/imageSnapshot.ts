import puppeteer, { Browser, Page } from 'puppeteer-core';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { logger } from '@storybook/node-logger';
import { constructUrl } from './url';
import { ImageSnapshotConfig } from './ImageSnapshotConfig';

expect.extend({ toMatchImageSnapshot });

// We consider taking the full page is a reasonable default.
const defaultScreenshotOptions = () => ({ fullPage: true, encoding: 'base64' } as const);

const noop: () => undefined = () => undefined;
const asyncNoop: () => Promise<undefined> = async () => undefined;

const defaultConfig: ImageSnapshotConfig = {
  storybookUrl: 'http://localhost:6006',
  chromeExecutablePath: undefined,
  getMatchOptions: noop,
  getScreenshotOptions: defaultScreenshotOptions,
  beforeScreenshot: noop,
  afterScreenshot: noop,
  getGotoOptions: noop,
  customizePage: asyncNoop,
  getCustomBrowser: undefined,
};

export const imageSnapshot = (customConfig: Partial<ImageSnapshotConfig> = {}) => {
  const {
    storybookUrl,
    chromeExecutablePath,
    getMatchOptions,
    getScreenshotOptions,
    beforeScreenshot,
    afterScreenshot,
    getGotoOptions,
    customizePage,
    getCustomBrowser,
  } = { ...defaultConfig, ...customConfig };

  let browser: Browser; // holds ref to browser. (ie. Chrome)
  let page: Page; // Hold ref to the page to screenshot.

  const testFn = async ({ context }: any) => {
    const { kind, framework, name } = context;
    if (framework === 'react-native') {
      // Skip tests since we de not support RN image snapshots.
      logger.error(
        "It seems you are running imageSnapshot on RN app and it's not supported. Skipping test."
      );

      return;
    }
    const url = constructUrl(storybookUrl, kind, name);

    if (!browser || !page) {
      logger.error(
        `Error when generating image snapshot for test ${kind} - ${name} : It seems the headless browser is not running.`
      );

      throw new Error('no-headless-browser-running');
    }

    expect.assertions(1);

    let image;
    try {
      await customizePage(page);
      await page.goto(url, getGotoOptions({ context, url }));
      await beforeScreenshot(page, { context, url });
      image = await page.screenshot(getScreenshotOptions({ context, url }));
      await afterScreenshot({ image, context });
    } catch (e) {
      logger.error(
        `Error when connecting to ${url}, did you start or build the storybook first? A storybook instance should be running or a static version should be built when using image snapshot feature.`
      );
      throw e;
    }

    expect(image).toMatchImageSnapshot(getMatchOptions({ context, url }));
  };

  testFn.afterAll = () => {
    if (getCustomBrowser && page) {
      return page.close();
    }

    return browser.close();
  };

  testFn.beforeAll = async () => {
    if (getCustomBrowser) {
      browser = await getCustomBrowser();
    } else {
      // add some options "no-sandbox" to make it work properly on some Linux systems as proposed here: https://github.com/Googlechrome/puppeteer/issues/290#issuecomment-322851507
      browser = await puppeteer.launch({
        args: ['--no-sandbox ', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: chromeExecutablePath,
      });
    }

    page = await browser.newPage();
  };

  return testFn;
};
