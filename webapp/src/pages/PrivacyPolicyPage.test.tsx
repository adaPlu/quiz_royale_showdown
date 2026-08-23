import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MemoryRouter } from '../navigation';
import PrivacyPolicyPage from './PrivacyPolicyPage';

describe('PrivacyPolicyPage', () => {
  it('renders the public policy content and game navigation', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/privacy-policy']}>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );

    expect(html).toContain('Privacy Policy');
    expect(html).toContain('Effective date:');
    expect(html).toContain('Information we collect');
    expect(html).toContain('We do not sell personal information');
    expect(html).toContain('href="/login"');
  });
});
