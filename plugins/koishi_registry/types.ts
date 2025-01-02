import type {
  Manifest as KoishiManifest,
  Registry as RegistryResult,
  RemotePackage,
  Score,
  SearchObject,
  SearchPackage,
  SearchResult,
  User as RegistryUser,
} from '@koishijs/registry'
import type { Dict } from 'cosmokit'

export type { RegistryUser, SearchObject, SearchResult }

export namespace NpmRegistry {
  export interface User {
    name?: string
    email: string
    url?: string
    username?: string
  }

  export interface Version extends RemotePackage {
    // _npmUser: User // I don't know what is this, but does exist somehow
  }

  export interface OkResult extends RegistryResult {
    _id: string
    _rev: string
    'dist-tags': Dict<string, string>
    maintainers: (string | User)[]
    keywords: string[]
    versions: Dict<Version>
    bugs?: { url?: string }
    homepage?: string
    repository?: { type?: string; url?: string }
    koishi: KoishiMarket.Manifest
    revs?: string[]
  }

  export type Result = OkResult

  export interface DownloadAPIResult {
    downloads: number
    start: string
    end: string
    package: string
  }

  export interface ErrorInfo {
    error: string
  }
}

export namespace KoishiMarket {
  export interface Result {
    total: number
    time: string
    objects: Object[]
    version?: number
    forceTime?: number
  }

  export interface Object {
    versions?: RemotePackage[]
    manifest: Manifest
    package: Package
    shortname: string
    score: Score
    rating: number
    verified: boolean
    workspace?: boolean
    category?: string
    portable?: boolean
    insecure?: boolean
    ignored?: boolean
    license: string
    createdAt: string
    updatedAt: string
    publishSize?: number
    installSize?: number
    dependents?: number
    downloads?: {
      lastMonth: number
    }
    updated?: string // probably backwards compatibility
    flags?: { insecure: number } // probably backwards compatibility
  }

  export interface Package extends SearchPackage {
    license: string
  }

  export interface Manifest extends KoishiManifest {}

  export interface User {
    name?: string
    email: string
    url?: string
    username?: string
  }
}

export interface NuxtPackage {
  version: string
  license: string
  publishedAt: string
  createdAt: string
  updatedAt: string
  downloads: {
    lastMonth: number
  }
}
