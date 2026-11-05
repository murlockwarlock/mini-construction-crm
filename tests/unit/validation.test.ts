import { describe, expect, it } from 'vitest'
import { validateComment, validateObject, validateTask } from '../../src/lib/validation'

describe('form validation', () => {
  it('rejects blank object fields', () => expect(validateObject(' ', '')).toMatchObject({ name: expect.any(String), address: expect.any(String) }))
  it('accepts valid task fields', () => expect(validateTask('Проверить опалубку', 'Описание', 'object', 'executor')).toEqual({}))
  it('requires a non-blank return comment', () => expect(validateComment('  ')).toBeTruthy())
})
