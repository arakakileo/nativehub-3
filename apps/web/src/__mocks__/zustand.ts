/**
 * Zustand mock for testing
 * Automatically resets store state between tests
 */

import { vi } from 'vitest'
import { act } from '@testing-library/react'
import type * as ZustandExportedTypes from 'zustand'

export * from 'zustand'

const { create: actualCreate, createStore: actualCreateStore } =
  await vi.importActual<typeof ZustandExportedTypes>('zustand')

// Track store reset functions
import { storeResetFns } from '../test/setup'

// Mock create function that registers reset handlers
export const create = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreate(stateCreator)
  const initialState = store.getInitialState()

  storeResetFns.add(() => {
    act(() => {
      store.setState(initialState, true)
    })
  })

  return store
}) as typeof actualCreate

// Mock createStore for vanilla stores
export const createStore = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreateStore(stateCreator)
  const initialState = store.getInitialState()

  storeResetFns.add(() => {
    store.setState(initialState, true)
  })

  return store
}) as typeof actualCreateStore
