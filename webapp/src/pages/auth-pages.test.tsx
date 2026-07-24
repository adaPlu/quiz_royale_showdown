import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

function renderAuthPage(page: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>);
}

describe('auth pages', () => {
  it('associates login labels with their inputs', () => {
    const html = renderAuthPage(<LoginPage />);

    expect(html).toContain('for="login-email"');
    expect(html).toContain('id="login-email"');
    expect(html).toContain('for="login-password"');
    expect(html).toContain('id="login-password"');
  });

  it('associates register labels with their inputs', () => {
    const html = renderAuthPage(<RegisterPage />);

    expect(html).toContain('for="register-username"');
    expect(html).toContain('id="register-username"');
    expect(html).toContain('for="register-email"');
    expect(html).toContain('id="register-email"');
    expect(html).toContain('for="register-password"');
    expect(html).toContain('id="register-password"');
    expect(html).toContain('for="register-confirm-password"');
    expect(html).toContain('id="register-confirm-password"');
  });

  it('smoke renders auth page navigation', () => {
    const loginHtml = renderAuthPage(<LoginPage />);
    const registerHtml = renderAuthPage(<RegisterPage />);

    expect(loginHtml).toContain('href="/register"');
    expect(registerHtml).toContain('href="/login"');
  });
});
