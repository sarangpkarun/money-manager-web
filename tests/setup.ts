import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { resetDisplay } from '../src/lib/display'

// display settings are module-level: every test starts from the defaults (Indian numbers, "5 Nov 2026" dates)
beforeEach(() => resetDisplay())
