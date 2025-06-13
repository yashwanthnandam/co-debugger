import { LanguageHandler, SupportedLanguage, LanguagePatterns, TypeContext, ParsedValue, LanguageSpecificConfig } from './languageHandler';

export class PythonLanguageHandler implements LanguageHandler {
    readonly language: SupportedLanguage = 'python';
    readonly patterns: LanguagePatterns = {
        applicationPatterns: [
            'request', 'response', 'data', 'result', 'user', 'config',
            'app', 'client', 'server', 'db', 'model', 'view', 'form',
            'session', 'context', 'params', 'args', 'kwargs', 'payload'
        ],
        systemPatterns: [
            '__', '_internal', 'sys', 'os', 'builtins', 'traceback',
            '__dict__', '__class__', '__module__', '__name__', '__doc__',
            '_pytest', '_mock', '__pycache__', 'site-packages'
        ],
        controlFlowPatterns: [
            'error', 'exception', 'result', 'success', 'failure', 'status',
            'valid', 'invalid', 'found', 'exists', 'enabled', 'disabled'
        ],
        primitiveTypes: [
            'int', 'float', 'str', 'bool', 'bytes', 'NoneType',
            'complex', 'type', 'object'
        ],
        complexTypes: [
            'list', 'dict', 'tuple', 'set', 'frozenset', 'class',
            'function', 'method', 'module', 'generator'
        ]
    };

    inferType(name: string, value: string, context: TypeContext): string {
        const keyLower = name.toLowerCase();
        
        // Python-specific type inference
        if (value === 'None') return 'NoneType';
        if (value === 'True' || value === 'False') return 'bool';
        if (value.startsWith("'") || value.startsWith('"')) return 'str';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+\.\d+$/.test(value)) return 'float';
        if (value.startsWith('[') && value.endsWith(']')) return 'list';
        if (value.startsWith('{') && value.endsWith('}')) return 'dict';
        if (value.startsWith('(') && value.endsWith(')')) return 'tuple';
        if (value.startsWith('<') && value.includes('object at')) return 'object';
        if (value.startsWith('<function')) return 'function';
        if (value.startsWith('<method')) return 'method';
        if (value.startsWith('<class')) return 'type';
        if (value.startsWith('<module')) return 'module';
        
        // Context-based inference
        if (keyLower.includes('request') || keyLower === 'req') return 'HttpRequest';
        if (keyLower.includes('response') || keyLower === 'resp') return 'HttpResponse';
        if (keyLower.includes('model')) return 'Model';
        if (keyLower.includes('form')) return 'Form';
        if (keyLower.includes('user')) return 'User';
        if (keyLower.includes('session')) return 'Session';
        if (keyLower.includes('db') || keyLower.includes('database')) return 'Database';
        
        return context.parentType || 'object';
    }

    parseVariableValue(value: string, type: string): ParsedValue {
        const isNil = this.isNilValue(value);
        const isPointer = value.includes('object at 0x');
        let memoryAddress: string | undefined;
        
        // Extract memory address for objects
        if (isPointer) {
            const addressMatch = value.match(/0x[a-fA-F0-9]+/);
            memoryAddress = addressMatch ? addressMatch[0] : undefined;
        }
        
        // Parse array/list length
        let arrayLength: number | undefined;
        if (type === 'list' || type === 'tuple') {
            const elements = this.parseArrayElements(value);
            arrayLength = elements.length;
        }
        
        // Parse dictionary key count
        let objectKeyCount: number | undefined;
        if (type === 'dict') {
            const fields = this.parseStructFields(value);
            objectKeyCount = Object.keys(fields).length;
        }
        
        return {
            displayValue: this.formatDisplayValue(value, type),
            actualValue: value,
            isExpandable: this.isExpandable(value, type),
            isNil,
            isPointer,
            memoryAddress,
            arrayLength,
            objectKeyCount
        };
    }

    extractFunctionName(rawName: string): string {
        if (!rawName) return 'unknown';
        
        let cleaned = rawName.trim();
        
        // Remove module paths but keep meaningful parts
        if (cleaned.includes('.')) {
            const parts = cleaned.split('.');
            // Keep last 2-3 parts for readability
            if (parts.length > 3) {
                cleaned = parts.slice(-3).join('.');
            }
        }
        
        // Remove angle brackets from method representations
        cleaned = cleaned.replace(/^<|>$/g, '');
        
        // Keep function names readable
        if (cleaned.length > 60) {
            cleaned = cleaned.substring(0, 57) + '...';
        }
        
        return cleaned;
    }

    isSystemVariable(name: string, value: string): boolean {
        return this.patterns.systemPatterns.some(pattern => 
            name.startsWith(pattern) || name.includes(pattern));
    }

    isApplicationRelevant(name: string, value: string): boolean {
        if (this.isSystemVariable(name, value)) return false;
        
        const nameLower = name.toLowerCase();
        const hasApplicationKeyword = this.patterns.applicationPatterns.some(keyword => 
            nameLower.includes(keyword) || keyword.includes(nameLower));
        
        const hasMeaningfulValue = value && 
            value !== 'None' && 
            !value.includes('object at 0x') &&
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
            typeName === 'list' || 
            typeName === 'tuple' ||
            typeName === 'set' ||
            typeName === 'frozenset' ||
            (value.startsWith('[') && value.endsWith(']')) ||
            (value.startsWith('(') && value.endsWith(')')) ||
            value.includes('list') ||
            value.includes('tuple')
        );
    }

    isStructuredType(value: string, typeName: string): boolean {
        return (
            typeName === 'dict' ||
            typeName === 'object' ||
            typeName === 'class' ||
            (value.startsWith('{') && value.endsWith('}')) ||
            value.includes('object at') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(value, typeName))
        );
    }

    parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        // Handle dictionary representation
        if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
            let content = rawValue.slice(1, -1);
            
            // Simple parsing for key-value pairs
            const pairs = this.splitDictPairs(content);
            pairs.forEach(pair => {
                const colonIndex = pair.indexOf(':');
                if (colonIndex > 0) {
                    const key = pair.substring(0, colonIndex).trim();
                    const value = pair.substring(colonIndex + 1).trim();
                    fields[key] = value;
                }
            });
        }
        
        // Handle object attribute representation
        if (rawValue.includes('object at')) {
            // This would require actual debugger integration to get attributes
            fields['__repr__'] = rawValue;
        }
        
        return fields;
    }

    parseArrayElements(rawValue: string): string[] {
        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            const content = rawValue.slice(1, -1);
            return this.splitArrayElements(content);
        }
        
        if (rawValue.startsWith('(') && rawValue.endsWith(')')) {
            const content = rawValue.slice(1, -1);
            return this.splitArrayElements(content);
        }
        
        return [];
    }

    isNilValue(rawValue: string): boolean {
        return rawValue.trim() === 'None';
    }

    formatDisplayValue(value: string, type: string): string {
        if (this.isNilValue(value)) return 'None';
        
        // Clean up string quotes for display
        if (type === 'str' && ((value.startsWith('"') && value.endsWith('"')) || 
                               (value.startsWith("'") && value.endsWith("'")))) {
            return value.slice(1, -1);
        }
        
        // Simplify object representations
        if (value.includes('object at 0x')) {
            const match = value.match(/<([^>]+)>/);
            if (match) {
                return `<${match[1]}>`;
            }
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
        if (name.startsWith('__') && name.endsWith('__')) score -= 75;
        
        // Value-based scoring
        if (value && value !== 'None' && !value.includes('object at 0x')) score += 25;
        if (value.startsWith('{') || value.startsWith('[')) score += 10;
        
        // Penalty for very long names or internal names
        if (name.length > 25) score -= 10;
        if (name.startsWith('_') && !name.startsWith('__')) score -= 25;
        
        return score;
    }

    getDefaultConfig(): LanguageSpecificConfig {
        return {
            maxVariableDepth: 4,
            maxVariableValueLength: 1500,
            maxParameterCount: 25,
            enableTypeInference: true,
            enableDeepExpansion: true,
            memoryLimitMB: 60,
            enableAsyncAnalysis: true
        };
    }

    private isExpandable(value: string, type: string): boolean {
        return (
            value.startsWith('{') ||
            value.startsWith('[') ||
            value.startsWith('(') ||
            value.includes('object at') ||
            type === 'dict' ||
            type === 'list' ||
            type === 'tuple' ||
            type === 'object' ||
            type === 'class'
        );
    }

    private splitDictPairs(content: string): string[] {
        const pairs: string[] = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
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
            
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
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