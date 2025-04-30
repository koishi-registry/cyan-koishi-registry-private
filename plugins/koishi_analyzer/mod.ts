import { Schema } from '@cordisjs/plugin-schema';
import type { CheckResult as KMCheck } from '@km-api/km-api/check';
import type { Score as RegistryScore } from '@koishijs/registry';
import { type Context, Service } from '@p/core';
import type { KoishiMarket, NpmRegistry } from '@plug/k-registry/types';
import { Time } from 'cosmokit';
import type { Awaitable, Dict } from 'cosmokit';
import merge from 'lodash.merge';

declare module '@plug/koishi' {
  export interface Koishi {
    analyzer: Analyzer;
  }
}

declare module '@p/core' {
  export interface Events {
    'analyzer/is-insecure'(
      context: AnalyzerContext,
    ): Awaitable<boolean | null | undefined>;

    'analyzer/is-verified'(
      context: AnalyzerContext,
    ): Awaitable<boolean | null | undefined>;
  }

  export interface Context {
    'koishi.analyzer': Analyzer;
  }
}

export interface WeightedEvaluator {
  name: string;
  weight: number;
  tag: keyof RegistryScore.Detail;

  evaluate(): Awaitable<number>;
}

export interface AnalyzerContext {
  ctx: Context;
  name: string;
  meta: NpmRegistry.Version;
  object: KoishiMarket.Object;
}

export interface AnalyzeResult {
  dependents?: number;
  category: string;
  installSize: number;
  publishSize: number;
}

export type Feature =
  | 'downloads'
  | 'rating'
  | 'score'
  | 'scope'
  | 'package'
  | 'manifest'
  | 'verified'
  | 'insecure'
  | 'installSize';
export type Features = Record<Feature, boolean>;

export type ScopeScore = {
  score: number;
  detail: Dict<number>;
};

export interface Scores {
  final: number;
  scopes: Dict<number, keyof RegistryScore.Detail>;
}

interface NuxtPackage {
  version: string;
  license: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  downloads: {
    lastMonth: number;
  };
}

// analyze step
// downloadsOf -> installSizeOf -> evaluators
export abstract class Analyzer extends Service {
  static inject = ['http'];

  declare caller: Context;
  static [Service.tracker] = {
    associate: 'koishi.analyzer',
    name: 'caller',
  };

  protected constructor(ctx: Context) {
    super(ctx, 'koishi.analyzer');
  }

  abstract getFeatures(): Features;

  // name = package name
  abstract downloadsOf(
    context: AnalyzerContext,
  ): Promise<{ lastMonth: number }>;

  // name = package name
  abstract analyzePackage(context: AnalyzerContext): Promise<AnalyzeResult>;

  abstract isInsecure(context: AnalyzerContext): Promise<boolean>;

  abstract isVerified(context: AnalyzerContext): Promise<boolean>;

  // name = package name
  abstract evaluators(context: AnalyzerContext): Promise<WeightedEvaluator[]>;

  async evaluate(
    context: AnalyzerContext,
    weights: Record<keyof RegistryScore.Detail, number>,
  ): Promise<Scores> {
    const evaluators = await this.evaluators(context);
    const scope: Dict<ScopeScore, keyof RegistryScore.Detail> = {
      quality: {
        score: 0,
        detail: {},
      },
      popularity: {
        score: 0,
        detail: {},
      },
      maintenance: {
        score: 0,
        detail: {},
      },
    } as const;
    // const detail: Dict<number> = {}
    await Promise.all(
      evaluators.map(async (evaluator) => {
        const score = await evaluator.evaluate();

        // detail[evaluator.name] = score
        scope[evaluator.tag] ??= { score: 0, detail: {} };
        scope[evaluator.tag].detail[evaluator.name] = score;
        scope[evaluator.tag].score += score * evaluator.weight;
      }),
    );

    const scores = {
      final: 0,
      scopes: {
        quality: 0,
        popularity: 0,
        maintenance: 0,
      },
    } satisfies Scores;

    Object.entries(scope).forEach(([name, { score }]) => {
      scores.scopes[name as keyof RegistryScore.Detail] = score;
      scores.final += score * weights[name as keyof RegistryScore.Detail];
    });

    return scores;
  }

  async analyzeAll(
    context: AnalyzerContext,
    ratingWeights: Record<keyof RegistryScore.Detail, number>,
  ): Promise<void> {
    const [downloads, { installSize, publishSize, dependents, category }] =
      await Promise.all([
        this.downloadsOf(context),
        this.analyzePackage(context),
      ]);
    context.object.installSize = installSize;
    context.object.publishSize = publishSize;
    context.object.category = category;
    context.object.dependents = dependents ?? 0;
    context.object.downloads = downloads;
    const [verified, insecure] = await Promise.all([
      this.isVerified(context),
      this.isInsecure(context),
    ]);
    context.object.verified ||= verified;
    context.object.insecure ||= insecure;
    const score = await this.evaluate(context, ratingWeights);
    context.object.rating ||= score.final * 10 - 0.3;
    context.object.score ||= {
      final: score.final,
      detail: score.scopes,
    };
  }
}

function minmax(min: number, value: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

function sigmoid(x: number, k: number, L: number, x_0: number) {
  return L / (1 + Math.exp(-k * (x - x_0)));
}

export class SimpleAnalyzer extends Analyzer {
  constructor(
    ctx: Context,
    public options: Partial<SimpleAnalyzer.Config> = {},
  ) {
    super(ctx);
  }

  override getFeatures(): Features {
    return {
      downloads: !!this.options.download,
      installSize: !!this.options.analyzer,
      rating: !!this.options.evaluator,
      insecure: true,
      verified: true,
      manifest: true,
      package: true,
      scope: false,
      score: false,
    };
  }

  async downloadsOf(context: AnalyzerContext): Promise<{ lastMonth: number }> {
    if (!this.options.download?.fetch) {
      try {
        const { downloads } = await this.ctx.http.get<NuxtPackage>(
          `https://api.nuxtjs.org/api/npm/package/${context.name}`,
        );
        return downloads;
      } catch {
        return { lastMonth: 0 };
      }
    }
    return await this.options.download?.fetch(context);
  }

  async analyzePackage(context: AnalyzerContext): Promise<AnalyzeResult> {
    if (!this.options.analyzer?.analyze) {
      try {
        const check = await this.ctx.http.get<KMCheck>(
          `https://km-api.itzdrli.cc/api/check/${encodeURIComponent(
            context.name,
          )}/`,
        );
        if (check.category) context.object.category = check.category;
        context.object.ignored ||= check.hidden;
        context.object.insecure = !!check.insecure;
        if (check.overrides) {
          Object.assign(context.object, merge(context.object, check.overrides));
        }
        return {
          category: check.category ?? 'unscoped',
          installSize: context.meta.dist.unpackedSize,
          publishSize: context.meta.dist.unpackedSize,
        };
      } catch {
        return {
          category: 'unscoped',
          installSize: context.meta.dist.unpackedSize,
          publishSize: context.meta.dist.unpackedSize,
        };
      }
    }
    return (
      (await this.options.analyzer?.analyze?.(context)) ?? {
        category: 'unscoped',
        installSize: context.meta.dist.unpackedSize,
        publishSize: context.meta.dist.unpackedSize,
      }
    );
  }

  async isInsecure(context: AnalyzerContext): Promise<boolean> {
    return !!(await context.ctx.serial('analyzer/is-insecure', context));
  }

  async isVerified(context: AnalyzerContext): Promise<boolean> {
    return !!(await context.ctx.serial('analyzer/is-verified', context));
  }

  evaluators(context: AnalyzerContext): Promise<WeightedEvaluator[]> {
    return (
      this.options.evaluator?.evaluators?.(context) ??
      Promise.resolve([
        {
          name: 'verified',
          tag: 'quality',
          weight: 0.6,
          evaluate() {
            return context.object.verified ? 1 : 0.2;
          },
        },
        {
          name: 'insecure',
          tag: 'quality',
          weight: 0.4,
          evaluate() {
            return context.object.insecure ? 0.3 : 0.5;
          },
        },
        {
          name: 'verified',
          tag: 'maintenance',
          weight: 0.5,
          evaluate() {
            return context.object.verified ? 0.8 : 0;
          },
        },
        {
          name: 'updateTime',
          tag: 'maintenance',
          weight: 0.5,
          evaluate() {
            const lastUpdate = new Date(context.object.updatedAt);
            const duration = Date.now() - +lastUpdate;
            const daysNotUpdated = duration / Time.day;
            return minmax(
              0,
              (minmax(90, daysNotUpdated, 365 * 2) - 90) / 120,
              1,
            );
          },
        },
        {
          name: 'popularity',
          tag: 'popularity',
          weight: 1,
          evaluate() {
            const createTime = new Date(context.object.createdAt);
            const duration = Date.now() - +createTime;
            const monthDays = new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              0,
            ).getDate();
            const download = context.object.downloads?.lastMonth ?? 0;
            const lifespan = minmax(7, duration / Time.day, monthDays);
            return sigmoid(
              (download * monthDays) / lifespan,
              0.01182,
              1.00222,
              283.4427,
            );
          },
        },
      ])
    );
  }

  override analyzeAll(context: AnalyzerContext): Promise<void> {
    return super.analyzeAll(context, {
      quality: 0.3,
      popularity: 0.4,
      maintenance: 0.3,
    });
  }
}

export namespace SimpleAnalyzer {
  export interface DownloadFetcher {
    fetch(context: AnalyzerContext): Promise<{ lastMonth: number }>;
  }

  export const DownloadFetcher = Schema.object({
    fetch: Schema.function(),
  });

  export interface PluginEvaluators {
    evaluators(context: AnalyzerContext): Promise<WeightedEvaluator[]>;
  }

  export const PluginEvaluators = Schema.object({
    evaluators: Schema.function(),
  });

  export interface SizeAnalyzer {
    analyze(context: AnalyzerContext): Promise<AnalyzeResult>;
  }

  export const PackageAnalyzer = Schema.object({
    analyze: Schema.function(),
  });

  export interface Config {
    download: DownloadFetcher;
    evaluator: PluginEvaluators;
    analyzer: SizeAnalyzer;
  }

  export const Config: Schema<Config> = Schema.object({
    download: DownloadFetcher,
    evaluator: PluginEvaluators,
    analyzer: PackageAnalyzer,
  });
}

export default Analyzer;
