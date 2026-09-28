import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import * as ts from 'typescript';

describe('Phase Boundary Enforcement (AST Analysis)', () => {
  const syncDir = resolve(__dirname, '../../src/services/sync');
  const projectRoot = resolve(__dirname, '../../..');

  const ALLOWED_PHASE3_IMPORTS = new Set([
    '@/services/streaming',           // providerRegistry
    '@/services/mapping',             // mappingService
    '@/services/anilist',             // anilistService
    '@/services/streaming/Provider',  // StreamingProvider interface + types
  ]);

  const FORBIDDEN_PHASE3_INTERNAL_IMPORTS = new Set([
    '@/services/streaming/ConsumetProvider',
    '@/services/streaming/AnivexaProvider',
    '@/services/streaming/index',     // internal ProviderRegistry class
    '@/services/streaming/CircuitBreaker',
    '@/services/cache',               // direct cache instances
    '@/services/cache.ts',            // mappingCache, searchCache, animeCache, episodeCache
  ]);

  const FORBIDDEN_PHASE1_INTERNAL_IMPORTS = new Set([
    '@/services/discovery/DiscoveryAdapter',
    '@/services/discovery/ConsumetDiscoveryAdapter',
    '@/services/discovery/AnivexaDiscoveryAdapter',
    '@/services/discovery/ProviderDiscovery',
    '@/services/discovery/DiscoveryScheduler',
    '@/services/discovery/HealthMonitor',
  ]);

  it('Phase 2 imports only allowed Phase 3 public contracts', () => {
    const phase2Files = readdirSync(syncDir, { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];

    for (const file of phase2Files) {
      const content = readFileSync(resolve(syncDir, file), 'utf-8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      
      const imports = extractImports(sourceFile);
      
      for (const imp of imports) {
        // Check for forbidden Phase 3 internal imports
        for (const forbidden of FORBIDDEN_PHASE3_INTERNAL_IMPORTS) {
          if (imp.startsWith(forbidden)) {
            throw new Error(`${file}: Forbidden Phase 3 internal import "${imp}"`);
          }
        }
        
        // Check for forbidden Phase 1 internal imports
        for (const forbidden of FORBIDDEN_PHASE1_INTERNAL_IMPORTS) {
          if (imp.startsWith(forbidden)) {
            throw new Error(`${file}: Forbidden Phase 1 internal import "${imp}"`);
          }
        }
        
        // Verify Phase 3 imports are only allowed public contracts
        const isPhase3Import = imp.startsWith('@/services/streaming') || 
                               imp.startsWith('@/services/mapping') || 
                               imp.startsWith('@/services/anilist');
        
        if (isPhase3Import && !imp.startsWith('./') && !imp.startsWith('../')) {
          const isExplicitlyAllowed = ['@/services/streaming', '@/services/mapping', '@/services/anilist', '@/services/streaming/Provider'].some(a => imp.startsWith(a));
          if (!isExplicitlyAllowed) {
            throw new Error(`${file}: Phase 3 import "${imp}" is not an approved public contract. Allowed: providerRegistry, mappingService, anilistService, StreamingProvider types`);
          }
        }
      }
    }
  });

  it('Phase 2 writes never target DiscoveredRelease.lifecycleState (assignment detection)', () => {
    const phase2Files = readdirSync(syncDir, { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];

    for (const file of phase2Files) {
      const content = readFileSync(resolve(syncDir, file), 'utf-8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      
      const hasLifecycleStateWrite = checkForLifecycleStateAssignment(sourceFile);
      expect(hasLifecycleStateWrite).toBe(false);
    }
  });

  it('Phase 2 does not call forbidden DiscoveredRelease mutators', () => {
    const phase2Files = readdirSync(syncDir, { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];

    for (const file of phase2Files) {
      const content = readFileSync(resolve(syncDir, file), 'utf-8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      
      const hasForbiddenMutator = checkForForbiddenDiscoveredReleaseMutators(sourceFile);
      expect(hasForbiddenMutator).toBe(false);
    }
  });

  it('Phase 2 does not declare duplicate Phase 3 service classes (AST-based)', () => {
    const phase2Files = readdirSync(syncDir, { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];

    const forbiddenClassNames = new Set([
      'ProviderRegistry',
      'MappingService',
      'StreamingProvider',
    ]);

    for (const file of phase2Files) {
      const content = readFileSync(resolve(syncDir, file), 'utf-8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      
      const declaredClasses = getDeclaredClassNames(sourceFile);
      
      for (const className of declaredClasses) {
        if (['ProviderRegistry', 'MappingService', 'StreamingProvider'].includes(className)) {
          throw new Error(`${file}: Declares class "${className}" which duplicates Phase 3 service.`);
        }
      }
    }
  });

  it('Phase 2 does not access forbidden caches/circuit-breakers directly (AST-based)', () => {
    const phase2Files = readdirSync(syncDir, { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];

    const forbiddenCacheAccess = new Set([
      'mappingCache',
      'searchCache',
      'animeCache',
      'episodeCache',
      'anilistSearchCache',
      'anilistDetailCache',
      'anilistSeasonalCache',
      'anilistBrowseCache',
      'anilistRecommendationsCache',
      'providerCircuitBreakers',
    ]);

    for (const file of phase2Files) {
      const content = readFileSync(resolve(syncDir, file), 'utf-8');
      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      
      const accesses = findPropertyAccessesAndCalls(sourceFile, ['mappingCache', 'searchCache', 'animeCache', 'episodeCache', 'anilistSearchCache', 'anilistDetailCache', 'anilistSeasonalCache', 'anilistBrowseCache', 'anilistRecommendationsCache', 'providerCircuitBreakers']);
      
      if (accesses.length > 0) {
        throw new Error(`${file}: Direct access to forbidden Phase 3 internals: ${accesses.join(', ')}. Phase 2 must use public contracts (providerRegistry, mappingService) instead.`);
      }
    }
  });

  function extractImports(sourceFile: ts.SourceFile): string[] {
    const imports: string[] = [];

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;

        if (ts.isStringLiteral(moduleSpecifier)) {
          imports.push(moduleSpecifier.text);
        }
      } else if (ts.isImportEqualsDeclaration(node)) {
        const moduleRef = node.moduleReference;

        if (
          ts.isExternalModuleReference(moduleRef) &&
          ts.isStringLiteral(moduleRef.expression)
        ) {
          imports.push(moduleRef.expression.text);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
  }

  function getDeclaredClassNames(sourceFile: ts.SourceFile): string[] {
    const classNames: string[] = [];
    
    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        classNames.push(node.name.text);
      }
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return classNames;
  }

  function checkForLifecycleStateAssignment(sourceFile: ts.SourceFile): boolean {
    let found = false;

    function visit(node: ts.Node) {
      if (ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const left = node.left;

        if (ts.isPropertyAccessExpression(left) &&
            left.name.text === 'lifecycleState') {
          found = true;
          return;
        }

        if (ts.isElementAccessExpression(left) &&
            ts.isStringLiteral(left.argumentExpression) &&
            left.argumentExpression.text === 'lifecycleState') {
          found = true;
          return;
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
  }

  function checkForForbiddenDiscoveredReleaseMutators(sourceFile: ts.SourceFile): boolean {
    const forbiddenMutators = new Set([
      'updateLifecycleState',
      'setLifecycleState',
      'transitionLifecycleState',
      'changeLifecycleState',
      'markLifecycleState',
    ]);

    let found = false;

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;

        if (forbiddenMutators.has(methodName)) {
          found = true;
          return;
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return found;
  }

  function findPropertyAccessesAndCalls(sourceFile: ts.SourceFile, targets: string[]): string[] {
    const found: string[] = [];
    const targetSet = new Set(targets);
    
    function visit(node: ts.Node) {
      if (ts.isPropertyAccessExpression(node)) {
        const propName = node.name.text;
        if (targetSet.has(propName)) {
          const parent = node.parent;
          if (ts.isCallExpression(parent) || ts.isPropertyAccessExpression(parent) || 
              ts.isElementAccessExpression(parent) || ts.isBinaryExpression(parent) ||
              ts.isPropertyAssignment(node.parent)) {
            found.push(propName);
          }
        }
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (targetSet.has(node.expression.text)) {
          found.push(node.expression.text);
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return [...new Set(found)];
  }
});
