import { LanguageHandler, SupportedLanguage, LanguagePatterns, TypeContext, ParsedValue, LanguageSpecificConfig } from './languageHandler';

export class JavaScriptLanguageHandler implements LanguageHandler {
    readonly language: SupportedLanguage = 'javascript';
    readonly patterns: LanguagePatterns = {
        applicationPatterns: [
            'req', 'res', 'request', 'response', 'data', 'result', 'user',
            'config', 'app', 'client', 'api', 'component', 'state', 'props',
            'context', 'params', 'query', 'body', 'payload', 'session'
        ],
        systemPatterns: [
            '__proto__', 'constructor', 'prototype', 'global', 'process', 'window',
            '__dirname', '__filename', 'module', 'exports', 'require', 'console',
            'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'
        ],
        controlFlowPatterns: [
            'error', 'err', 'success', 'failure', 'result', 'status', 'code',
            'valid', 'invalid', 'found', 'exists', 'enabled', 'disabled', 'done'
        ],
        primitiveTypes: [
            'string', 'number', 'boolean', 'undefined', 'null', 'symbol', 'bigint'
        ],
        complexTypes: [
            'object', 'function', 'array', 'date', 'regexp', 'promise',
            'map', 'set', 'weakmap', 'weakset', 'arraybuffer'
        ]
    };

    inferType(name: string, value: string, context: TypeContext): string {
        const keyLower = name.toLowerCase();
        
        // JavaScript-specific type inference
        if (value === 'undefined') return 'undefined';
        if (value === 'null') return 'null';
        if (value === 'true' || value === 'false') return 'boolean';
        if (/^\d+$/.test(value)) return 'number';
        if (/^\d+\.\d+$/.test(value)) return 'number';
        if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) return 'string';
        if (value.startsWith('[') && value.endsWith(']')) return 'Array';
        if (value.startsWith('{') && value.endsWith('}')) return 'Object';
        if (value.startsWith('function')) return 'Function';
        if (value.startsWith('async function')) return 'AsyncFunction';
        if (value.startsWith('/') && value.endsWith('/')) return 'RegExp';
        if (value.includes('Promise')) return 'Promise';
        if (value.includes('Date')) return 'Date';
        
        // Context-based inference
        if (keyLower.includes('request') || keyLower === 'req') return 'Request';
        if (keyLower.includes('response') || keyLower === 'res') return 'Response';
        if (keyLower.includes('element') || keyLower.includes('node')) return 'HTMLElement';
        if (keyLower.includes('event')) return 'Event';
        if (keyLower.includes('promise')) return 'Promise';
        if (keyLower.includes('callback') || keyLower.includes('cb')) return 'Function';
        if (keyLower.includes('component')) return 'Component';
        if (keyLower.includes('state')) return 'State';
        if (keyLower.includes('props')) return 'Props';
        
        return context.parentType || 'object';
    }

    parseVariableValue(value: string, type: string): ParsedValue {
        const isNil = this.isNilValue(value);
        const isPointer = false; // JavaScript doesn't expose pointers
        
        // Parse array length
        let arrayLength: number | undefined;
        if (type === 'Array' || value.includes('Array(')) {
            const elements = this.parseArrayElements(value);
            arrayLength = elements.length;
        }
        
        // Parse object key count
        let objectKeyCount: number | undefined;
        if (type === 'Object' || (value.startsWith('{') && value.endsWith('}'))) {
            const fields = this.parseStructFields(value);
            objectKeyCount = Object.keys(fields).length;
        }
        
        return {
            displayValue: this.formatDisplayValue(value, type),
            actualValue: value,
            isExpandable: this.isExpandable(value, type),
            isNil,
            isPointer,
            arrayLength,
            objectKeyCount
        };
    }

    extractFunctionName(rawName: string): string {
        if (!rawName) return 'unknown';
        
        let cleaned = rawName.trim();
        
        // Remove module paths and keep meaningful parts
        if (cleaned.includes('/')) {
            const parts = cleaned.split('/');
            cleaned = parts[parts.length - 1];
        }
        
        // Handle anonymous functions
        if (cleaned.includes('anonymous')) {
            return 'anonymous';
        }
        
        // Handle arrow functions
        if (cleaned.includes('=>')) {
            return 'arrow function';
        }
        
        // Clean up function representations
        cleaned = cleaned.replace(/^function\s*/, '');
        cleaned = cleaned.replace(/\s*\{.*\}$/, '');
        
        // Keep function names readable
        if (cleaned.length > 50) {
            const parts = cleaned.split('.');
            if (parts.length > 1) {
                cleaned = parts.slice(-2).join('.');
            } else {
                cleaned = cleaned.substring(0, 47) + '...';
            }
        }
        
        return cleaned || 'unnamed';
    }

    isSystemVariable(name: string, value: string): boolean {
        return this.patterns.systemPatterns.some(pattern => 
            name.startsWith(pattern) || name.includes(pattern) || name === pattern);
    }

    isApplicationRelevant(name: string, value: string): boolean {
        if (this.isSystemVariable(name, value)) return false;
        
        const nameLower = name.toLowerCase();
        const hasApplicationKeyword = this.patterns.applicationPatterns.some(keyword => 
            nameLower.includes(keyword) || keyword.includes(nameLower));
        
        const hasMeaningfulValue = value && 
            value !== 'undefined' && 
            value !== 'null' &&
            value.length > 1;
        
        return hasApplicationKeyword || hasMeaningfulValue;
    }

    isControlFlowVariable(name: string): boolean {
        const nameLower = name.toLowerCase();
        return this.patterns.controlFlowPatterns.some(pattern => 
            nameLower.includes(pattern));
    }

    isPrimitiveType(typeName: string): boolean {
        return this.patterns.primitiveTypes.some(p => typeName.includes(p));
    }

    isCollectionType(value: string, typeName: string): boolean {
        return (
            typeName === 'Array' ||
            typeName === 'Set' ||
            typeName === 'Map' ||
            typeName === 'WeakSet' ||
            typeName === 'WeakMap' ||
            (value.startsWith('[') && value.endsWith(']')) ||
            value.includes('Array') ||
            value.includes('Set') ||
            value.includes('Map')
        );
    }

    isStructuredType(value: string, typeName: string): boolean {
        return (
            typeName === 'Object' ||
            typeName === 'Function' ||
            typeName === 'Promise' ||
            typeName === 'Date' ||
            (value.startsWith('{') && value.endsWith('}')) ||
            value.includes('Object') ||
            value.includes('function') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(value, typeName))
        );
    }

    parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
            let content = rawValue.slice(1, -1);
            
            // Simple parsing for key-value pairs
            const pairs = this.splitObjectPairs(content);
            pairs.forEach(pair => {
                const colonIndex = pair.indexOf(':');
                if (colonIndex > 0) {
                    let key = pair.substring(0, colonIndex).trim();
                    const value = pair.substring(colonIndex + 1).trim();
                    
                    // Remove quotes from keys
                    if ((key.startsWith('"') && key.endsWith('"')) || 
                        (key.startsWith("'") && key.endsWith("'"))) {
                        key = key.slice(1, -1);
                    }
                    
                    fields[key] = value;
                }
            });
        }
        
        return fields;
    }

    parseArrayElements(rawValue: string): string[] {
        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            const content = rawValue.slice(1, -1);
            return this.splitArrayElements(content);
        }
        
        return [];
    }

    isNilValue(rawValue: string): boolean {
        const nilValues = ['undefined', 'null'];
        return nilValues.includes(rawValue.trim());
    }

    formatDisplayValue(value: string, type: string): string {
        if (this.isNilValue(value)) return value;
        
        // Clean up string quotes for display
        if (type === 'string' && ((value.startsWith('"') && value.endsWith('"')) || 
                                  (value.startsWith("'") && value.endsWith("'")) ||
                                  (value.startsWith('`') && value.endsWith('`')))) {
            return value.slice(1, -1);
        }
        
        // Simplify function representations
        if (value.startsWith('function')) {
            const match = value.match(/function\s*([^(]*)/);
            if (match && match[1]) {
                return `function ${match[1]}()`;
            }
            return 'function()';
        }
        
        return value;
    }

    calculateVariableImportance(name: string, value: string): number {
        let score = 0;
        const nameLower = name.toLowerCase();
        
        // High importance patterns
        if (this.patterns.applicationPatterns.some(p => nameLower.includes(p))) score += 100;
        if (this.patterns.controlFlowPatterns.some(p => nameLower.includes(p))) score += 75;
        
        // Low importance patterns (negative score)
        if (this.patterns.systemPatterns.some(p => nameLower.includes(p))) score -= 50;
        if (name.startsWith('__') || name === 'constructor' || name === 'prototype') score -= 75;
        
        // Value-based scoring
        if (value && value !== 'undefined' && value !== 'null') score += 25;
        if (value.startsWith('{') || value.startsWith('[')) score += 10;
        if (value.includes('function')) score += 15;
        
        // Penalty for very long names or internal names
        if (name.length > 30) score -= 10;
        if (name.startsWith('_') && !name.startsWith('__')) score -= 25;
        
        // Boost for common JavaScript patterns
        if (nameLower.includes('handler') || nameLower.includes('callback')) score += 20;
        if (nameLower.includes('async') || nameLower.includes('promise')) score += 20;
        
        return score;
    }

    getDefaultConfig(): LanguageSpecificConfig {
        return {
            maxVariableDepth: 5,
            maxVariableValueLength: 2000,
            maxParameterCount: 20,
            enableTypeInference: true,
            enableDeepExpansion: true,
            memoryLimitMB: 40,
            analyzeClosures: true,
            enablePrototypeChain: true
        };
    }

    private isExpandable(value: string, type: string): boolean {
        return (
            value.startsWith('{') ||
            value.startsWith('[') ||
            value.includes('Object') ||
            value.includes('Array') ||
            value.includes('function') ||
            type === 'Object' ||
            type === 'Array' ||
            type === 'Function' ||
            type === 'Promise' ||
            type === 'Date'
        );
    }

    private splitObjectPairs(content: string): string[] {
        const pairs: string[] = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if ((char === '"' || char === "'" || char === '`') && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes && content[i-1] !== '\\') {
                inQuotes = false;
                quoteChar = '';
            } else if (!inQuotes) {
                if (char === '{' || char === '[' || char === '(') depth++;
                else if (char === '}' || char === ']' || char === ')') depth--;
                else if (char === ',' && depth === 0) {
                    if (current.trim()) pairs.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current.trim()) pairs.push(current.trim());
        return pairs;
    }

    private splitArrayElements(content: string): string[] {
        const elements: string[] = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if ((char === '"' || char === "'" || char === '`') && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes && content[i-1] !== '\\') {
                inQuotes = false;
                quoteChar = '';
            } else if (!inQuotes) {
                if (char === '{' || char === '[' || char === '(') depth++;
                else if (char === '}' || char === ']' || char === ')') depth--;
                else if (char === ',' && depth === 0) {
                    if (current.trim()) elements.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current.trim()) elements.push(current.trim());
        return elements;
    }
}