import { LanguageHandler, SupportedLanguage, LanguagePatterns, TypeContext, ParsedValue, LanguageSpecificConfig } from './languageHandler';

export class CppLanguageHandler implements LanguageHandler {
    readonly language: SupportedLanguage = 'cpp';

    readonly patterns: LanguagePatterns = {
        applicationPatterns: [
            'user', 'data', 'result', 'config', 'request', 'response',
            'handler', 'processor', 'manager', 'controller', 'service',
            'client', 'server', 'api', 'model', 'entity', 'component',
            'application', 'business', 'domain', 'core', 'main'
        ],
        systemPatterns: [
            'std::', '__', '_', 'this', 'vtbl', 'vptr', 'allocator',
            'iterator', 'const_iterator', 'reverse_iterator',
            'internal', 'detail', 'impl', 'anonymous', 'unnamed',
            'debug', 'trace', 'log', 'temp', 'tmp'
        ],
        controlFlowPatterns: [
            'result', 'status', 'error', 'success', 'failure', 'valid',
            'invalid', 'found', 'exists', 'ready', 'done', 'complete',
            'enabled', 'disabled', 'active', 'running', 'stopped'
        ],
        primitiveTypes: [
            'bool', 'char', 'signed char', 'unsigned char',
            'short', 'unsigned short', 'int', 'unsigned int',
            'long', 'unsigned long', 'long long', 'unsigned long long',
            'float', 'double', 'long double', 'void', 'wchar_t'
        ],
        complexTypes: [
            'std::string', 'std::wstring', 'std::vector', 'std::list',
            'std::deque', 'std::set', 'std::multiset', 'std::map',
            'std::multimap', 'std::unordered_set', 'std::unordered_map',
            'std::array', 'std::queue', 'std::stack', 'std::priority_queue',
            'std::shared_ptr', 'std::unique_ptr', 'std::weak_ptr'
        ]
    };

    inferType(name: string, value: string, context: TypeContext): string {
        const keyLower = name.toLowerCase();
        
        // C++-specific type inference
        if (value === 'nullptr' || value === 'NULL') return 'nullptr_t';
        if (value === 'true' || value === 'false') return 'bool';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+u$/i.test(value)) return 'unsigned int';
        if (/^\d+l$/i.test(value)) return 'long';
        if (/^\d+ll$/i.test(value)) return 'long long';
        if (/^\d+\.\d+f?$/i.test(value)) return 'double';
        if (value.startsWith('"') && value.endsWith('"')) return 'std::string';
        if (value.startsWith("'") && value.endsWith("'")) return 'char';
        if (value.includes('0x')) return 'pointer';
        if (value.startsWith('{') && value.endsWith('}')) return 'struct/class';
        if (value.startsWith('[') && value.endsWith(']')) return 'array';
        
        // STL container detection
        if (value.includes('std::vector')) return 'std::vector';
        if (value.includes('std::list')) return 'std::list';
        if (value.includes('std::map')) return 'std::map';
        if (value.includes('std::set')) return 'std::set';
        if (value.includes('std::string')) return 'std::string';
        if (value.includes('std::shared_ptr')) return 'std::shared_ptr';
        if (value.includes('std::unique_ptr')) return 'std::unique_ptr';
        
        // Context-based inference
        if (keyLower.includes('string') || keyLower.includes('text') || keyLower.includes('message')) return 'std::string';
        if (keyLower.includes('vector') || keyLower.includes('array') || keyLower.includes('list')) return 'std::vector';
        if (keyLower.includes('map') || keyLower.includes('dict')) return 'std::map';
        if (keyLower.includes('set')) return 'std::set';
        if (keyLower.includes('ptr') || keyLower.includes('pointer')) return 'pointer';
        if (keyLower.includes('count') || keyLower.includes('size') || keyLower.includes('length')) return 'size_t';
        if (keyLower.includes('id') && /^\d+$/.test(value)) return 'uint64_t';
        if (keyLower.includes('index') || keyLower.includes('pos')) return 'size_t';
        if (keyLower.includes('time') || keyLower.includes('timestamp')) return 'std::chrono::time_point';
        if (keyLower.includes('duration')) return 'std::chrono::duration';
        
        return context.parentType || 'auto';
    }

    parseVariableValue(value: string, type: string): ParsedValue {
        const isNil = this.isNilValue(value);
        const isPointer = type.includes('*') || value.includes('0x') || type.includes('ptr');
        let memoryAddress: string | undefined;
        
        // Extract memory address for pointers
        if (isPointer) {
            const addressMatch = value.match(/0x[a-fA-F0-9]+/);
            memoryAddress = addressMatch ? addressMatch[0] : undefined;
        }
        
        // Parse array/container length
        let arrayLength: number | undefined;
        if (this.isCollectionType(value, type)) {
            const elements = this.parseArrayElements(value);
            arrayLength = elements.length;
        }
        
        // Parse object field count
        let objectKeyCount: number | undefined;
        if (value.includes('{') && value.includes('}')) {
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
        
        // Remove namespace paths but keep class::method
        if (cleaned.includes('::')) {
            const parts = cleaned.split('::');
            // Keep last 2-3 parts for readability
            if (parts.length > 3) {
                cleaned = parts.slice(-3).join('::');
            }
        }
        
        // Remove template parameters
        cleaned = cleaned.replace(/<[^>]*>/g, '');
        
        // Remove function parameters but keep parentheses
        cleaned = cleaned.replace(/\([^)]*\)/g, '()');
        
        // Clean up common C++ decorations
        cleaned = cleaned.replace(/\s*const\s*$/, '');
        cleaned = cleaned.replace(/\s*override\s*$/, '');
        cleaned = cleaned.replace(/\s*final\s*$/, '');
        
        // Keep function names readable
        if (cleaned.length > 60) {
            cleaned = cleaned.substring(0, 57) + '...';
        }
        
        return cleaned;
    }

    isSystemVariable(name: string, value: string): boolean {
        return this.patterns.systemPatterns.some(pattern => 
            name.startsWith(pattern) || name.includes(pattern) || value.includes(pattern));
    }

    isApplicationRelevant(name: string, value: string): boolean {
        if (this.isSystemVariable(name, value)) return false;
        
        const nameLower = name.toLowerCase();
        const hasApplicationKeyword = this.patterns.applicationPatterns.some(keyword => 
            nameLower.includes(keyword) || keyword.includes(nameLower));
        
        const hasMeaningfulValue = value && 
            value !== 'nullptr' && 
            value !== 'NULL' &&
            !value.includes('0x') &&
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
            typeName.includes('[]') ||
            typeName.includes('std::vector') ||
            typeName.includes('std::list') ||
            typeName.includes('std::deque') ||
            typeName.includes('std::array') ||
            typeName.includes('std::set') ||
            typeName.includes('std::multiset') ||
            (value.startsWith('[') && value.endsWith(']')) ||
            value.includes('vector') ||
            value.includes('list') ||
            value.includes('array')
        );
    }

    isStructuredType(value: string, typeName: string): boolean {
        return (
            typeName.includes('struct') ||
            typeName.includes('class') ||
            typeName.includes('std::map') ||
            typeName.includes('std::pair') ||
            (value.includes('{') && value.includes('}')) ||
            value.includes('0x') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(value, typeName))
        );
    }

    parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        if (rawValue.includes('{') && rawValue.includes('}')) {
            let content = rawValue;
            const structMatch = content.match(/\{([^}]+)\}/);
            if (structMatch) {
                content = structMatch[1];
                
                // Parse field = value pairs
                const pairs = this.splitStructPairs(content);
                pairs.forEach(pair => {
                    const equalIndex = pair.indexOf('=');
                    if (equalIndex > 0) {
                        const key = pair.substring(0, equalIndex).trim();
                        const value = pair.substring(equalIndex + 1).trim();
                        fields[key] = value;
                    } else {
                        // Handle positional fields
                        const colonIndex = pair.indexOf(':');
                        if (colonIndex > 0) {
                            const key = pair.substring(0, colonIndex).trim();
                            const value = pair.substring(colonIndex + 1).trim();
                            fields[key] = value;
                        }
                    }
                });
            }
        }
        
        return fields;
    }

    parseArrayElements(rawValue: string): string[] {
        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            const content = rawValue.slice(1, -1);
            return this.splitArrayElements(content);
        }
        
        // Handle STL container representation
        if (rawValue.includes('{') && rawValue.includes('}')) {
            const match = rawValue.match(/\{([^}]+)\}/);
            if (match) {
                return this.splitArrayElements(match[1]);
            }
        }
        
        return [];
    }

    isNilValue(rawValue: string): boolean {
        const nilValues = ['nullptr', 'NULL', '0x0', '(null)'];
        return nilValues.includes(rawValue.trim());
    }

    formatDisplayValue(value: string, type: string): string {
        if (this.isNilValue(value)) return 'nullptr';
        
        // Clean up string quotes for display
        if (type.includes('string') && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        // Clean up character literals
        if (type === 'char' && value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        
        // Simplify pointer representations
        if (value.includes('0x') && type.includes('*')) {
            return `*${value}`;
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
        if (name.startsWith('__') || name.startsWith('_')) score -= 75;
        if (name.includes('vtbl') || name.includes('vptr')) score -= 100;

        // Value-based scoring
        if (value && value !== 'nullptr' && value !== 'NULL' && !value.includes('0x')) score += 25;
        if (value.startsWith('{') || value.startsWith('[')) score += 10;

        // Penalty for very long names or generated names
        if (name.length > 25) score -= 10;
        if (name.includes('anonymous') || name.includes('unnamed')) score -= 50;

        // Boost for common C++ patterns
        if (nameLower.includes('manager') || nameLower.includes('handler')) score += 20;
        // Cannot check type here, so skip type-based scoring

        return score;
    }

    getDefaultConfig(): LanguageSpecificConfig {
        return {
            maxVariableDepth: 5,
            maxVariableValueLength: 1000,
            maxParameterCount: 25,
            enableTypeInference: true,
            enableDeepExpansion: true,
            memoryLimitMB: 60
        };
    }

    private isExpandable(value: string, type: string): boolean {
        return (
            value.startsWith('{') ||
            value.startsWith('[') ||
            value.includes('0x') ||
            type.includes('std::') ||
            type.includes('struct') ||
            type.includes('class') ||
            type.includes('*') ||
            type.includes('[]')
        );
    }

    private splitStructPairs(content: string): string[] {
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