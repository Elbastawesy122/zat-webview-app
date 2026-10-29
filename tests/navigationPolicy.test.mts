import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideNavigation, getHttpHost } from '../src/navigationPolicy.ts';

const HOSTS = ['zat-ksa.com'];
const top = (url: string) => decideNavigation({ url, isTopFrame: true }, HOSTS);
const frame = (url: string) => decideNavigation({ url, isTopFrame: false }, HOSTS);
const android = (url: string) => decideNavigation({ url }, HOSTS);

describe('top-frame navigation', () => {
  it('allows the site and its subdomains', () => {
    assert.equal(top('https://zat-ksa.com/'), 'allow');
    assert.equal(top('https://www.zat-ksa.com/login?next=/'), 'allow');
    assert.equal(top('https://ZAT-KSA.com:443/path'), 'allow');
    assert.equal(android('https://www.zat-ksa.com/'), 'allow');
  });

  it('sends other web origins to the system browser', () => {
    assert.equal(top('https://accounts.google.com/o/oauth2/auth'), 'external');
    assert.equal(top('https://zat-ksa.com.evil.example/'), 'external');
    assert.equal(top('https://evilzat-ksa.com/'), 'external');
    assert.equal(top('http://zat-ksa.com/'), 'external');
  });

  it('blocks ambiguous authorities that could spoof the host', () => {
    assert.equal(top('https://evil.example\\@zat-ksa.com/'), 'block');
    assert.equal(top('https://user@zat-ksa.com/'), 'block');
    assert.equal(getHttpHost('https://evil.example\\@zat-ksa.com/'), null);
  });

  it('opens contact schemes externally and blocks dangerous ones', () => {
    assert.equal(top('tel:+966500000000'), 'external');
    assert.equal(top('mailto:info@zat-ksa.com'), 'external');
    assert.equal(top('whatsapp://send?phone=966500000000'), 'external');
    assert.equal(top('intent://scan/#Intent;scheme=zxing;end'), 'block');
    assert.equal(top('javascript:alert(1)'), 'block');
    assert.equal(top('file:///etc/passwd'), 'block');
    assert.equal(top('data:text/html,<h1>x</h1>'), 'block');
    assert.equal(top('not a url'), 'block');
  });
});

describe('sub-frame navigation (iOS reports iframes too)', () => {
  it('keeps reCAPTCHA and Firebase auth iframes inside the page', () => {
    assert.equal(frame('https://www.google.com/recaptcha/api2/anchor?k=abc'), 'allow');
    assert.equal(frame('https://www.google.com/recaptcha/api2/bframe?k=abc'), 'allow');
    assert.equal(frame('https://www.recaptcha.net/recaptcha/api2/anchor'), 'allow');
    assert.equal(frame('https://example-project.firebaseapp.com/__/auth/iframe'), 'allow');
    assert.equal(frame('about:blank'), 'allow');
    assert.equal(frame('about:srcdoc'), 'allow');
  });

  it('never lets an iframe launch other apps or load insecure content', () => {
    assert.equal(frame('intent://x#Intent;end'), 'block');
    assert.equal(frame('tel:123'), 'block');
    assert.equal(frame('http://insecure.example/'), 'block');
    assert.equal(frame('javascript:alert(1)'), 'block');
  });
});
