import { LanguageHandler, SupportedLanguage, LanguagePatterns, TypeContext, ParsedValue, LanguageSpecificConfig } from './languageHandler';

export class JavaLanguageHandler implements LanguageHandler {
    readonly language: SupportedLanguage = 'java';
    readonly patterns: LanguagePatterns = {
        applicationPatterns: [
            'controller', 'service', 'repository', 'entity', 'dto', 'model',
            'handler', 'processor', 'manager', 'facade', 'dao', 'component',
            'request', 'response', 'data', 'result', 'user', 'config',
            'client', 'server', 'api', 'rest', 'web', 'business'
        ],
        systemPatterns: [
            'java.', 'javax.', 'org.springframework.', 'org.apache.',
            'com.sun.', 'sun.', 'jdk.', 'oracle.',
            'this$', 'val$', 'arg$', 'synthetic', 'bridge',
            'class$', 'method$', 'field$', 'enum$', 'annotation$'
        ],
        controlFlowPatterns: [
            'result', 'success', 'failure', 'error', 'exception', 'status',
            'valid', 'invalid', 'found', 'exists', 'enabled', 'disabled',
            'complete', 'finished', 'done', 'ready', 'active', 'running'
        ],
        primitiveTypes: [
            'boolean', 'byte', 'char', 'short', 'int', 'long',
            'float', 'double', 'void', 'Boolean', 'Byte', 'Character',
            'Short', 'Integer', 'Long', 'Float', 'Double', 'String'
        ],
        complexTypes: [
            'Object', 'List', 'ArrayList', 'LinkedList', 'Vector',
            'Set', 'HashSet', 'TreeSet', 'LinkedHashSet',
            'Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'ConcurrentHashMap',
            'Collection', 'Iterator', 'Iterable', 'Optional', 'Stream'
        ]
    };

    inferType(name: string, value: string, context: TypeContext): string {
        const keyLower = name.toLowerCase();
        
        // Java-specific type inference
        if (value === 'null') return 'null';
        if (value === 'true' || value === 'false') return 'boolean';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+L$/.test(value)) return 'long';
        if (/^\d+\.\d+f?$/.test(value)) return 'double';
        if (value.startsWith('"') && value.endsWith('"')) return 'String';
        if (value.startsWith('[') && value.endsWith(']')) return 'Array';
        if (value.includes('@') && value.includes(' ')) {
            // Java object representation: com.example.User@1a2b3c4d
            const match = value.match(/^([^@]+)@/);
            if (match) return match[1];
        }
        
        // Context-based inference
        if (keyLower.includes('list') || keyLower.includes('array')) return 'List';
        if (keyLower.includes('map') || keyLower.includes('dict')) return 'Map';
        if (keyLower.includes('set')) return 'Set';
        if (keyLower.includes('string') || keyLower.includes('text') || keyLower.includes('message')) return 'String';
        if (keyLower.includes('count') || keyLower.includes('size') || keyLower.includes('length')) return 'int';
        if (keyLower.includes('id') && /^\d+$/.test(value)) return 'Long';
        if (keyLower.includes('price') || keyLower.includes('amount') || keyLower.includes('value')) return 'BigDecimal';
        if (keyLower.includes('date') || keyLower.includes('time') || keyLower.includes('timestamp')) return 'LocalDateTime';
        if (keyLower.includes('user') || keyLower.includes('person')) return 'User';
        if (keyLower.includes('request') || keyLower === 'req') return 'HttpServletRequest';
        if (keyLower.includes('response') || keyLower === 'resp') return 'HttpServletResponse';
        if (keyLower.includes('service')) return 'Service';
        if (keyLower.includes('repository') || keyLower.includes('dao')) return 'Repository';
        if (keyLower.includes('controller')) return 'Controller';
        if (keyLower.includes('entity') || keyLower.includes('model')) return 'Entity';
        
        return context.parentType || 'Object';
    }

    parseVariableValue(value: string, type: string): ParsedValue {
        const isNil = this.isNilValue(value);
        const isPointer = false; // Java doesn't expose pointers directly
        
        // Parse array length
        let arrayLength: number | undefined;
        if (type.includes('[]') || type.includes('Array') || type.includes('List')) {
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
            arrayLength,
            objectKeyCount
        };
    }

    extractFunctionName(rawName: string): string {
        if (!rawName) return 'unknown';
        
        let cleaned = rawName.trim();
        
        // Remove package paths but keep class.method
        if (cleaned.includes('.')) {
            const parts = cleaned.split('.');
            // Keep last 2-3 parts for readability (package.Class.method)
            if (parts.length > 3) {
                cleaned = parts.slice(-3).join('.');
            }
        }
        
        // Remove generic type parameters
        cleaned = cleaned.replace(/<[^>]*>/g, '');
        
        // Remove method parameters
        cleaned = cleaned.replace(/\([^)]*\)/g, '()');
        
        // Keep method names readable
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
            value !== 'null' && 
            !value.includes('@') &&
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
            typeName.includes('List') ||
            typeName.includes('Set') ||
            typeName.includes('Collection') ||
            typeName.includes('Array') ||
            (value.startsWith('[') && value.endsWith(']')) ||
            value.includes('ArrayList') ||
            value.includes('LinkedList') ||
            value.includes('HashSet')
        );
    }

    isStructuredType(value: string, typeName: string): boolean {
        return (
            typeName.includes('Object') ||
            typeName.includes('Map') ||
            (value.includes('{') && value.includes('}')) ||
            value.includes('@') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(value, typeName))
        );
    }

    parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        // Handle object toString() representation
        if (rawValue.includes('{') && rawValue.includes('}')) {
            let content = rawValue;
            const objectMatch = content.match(/\{([^}]+)\}/);
            if (objectMatch) {
                content = objectMatch[1];
                
                // Parse field=value pairs
                const pairs = this.splitObjectPairs(content);
                pairs.forEach(pair => {
                    const equalIndex = pair.indexOf('=');
                    if (equalIndex > 0) {
                        const key = pair.substring(0, equalIndex).trim();
                        const value = pair.substring(equalIndex + 1).trim();
                        fields[key] = value;
                    }
                });
            }
        }
        
        // Handle Java object representation
        if (rawValue.includes('@')) {
            fields['__toString__'] = rawValue;
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
        return rawValue.trim() === 'null';
    }

    formatDisplayValue(value: string, type: string): string {
        if (this.isNilValue(value)) return 'null';
        
        // Clean up string quotes for display
        if (type === 'String' && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        // Simplify object representations
        if (value.includes('@')) {
            const match = value.match(/([^.]+)@/);
            if (match) {
                return `<${match[1]} object>`;
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
        if (name.startsWith('this$') || name.startsWith('val$') || name.startsWith('arg$')) score -= 75;
        
        // Value-based scoring
        if (value && value !== 'null' && !value.includes('@')) score += 25;
        if (value.startsWith('{') || value.startsWith('[')) score += 10;
        
        // Penalty for very long names or generated names
        if (name.length > 30) score -= 10;
        if (name.includes('$') && !name.startsWith('this$')) score -= 25;
        
        // Boost for common Java patterns
        if (nameLower.includes('service') || nameLower.includes('repository')) score += 20;
        if (nameLower.includes('controller') || nameLower.includes('handler')) score += 20;
        
        return score;
    }

    getDefaultConfig(): LanguageSpecificConfig {
        return {
            maxVariableDepth: 4,
            maxVariableValueLength: 1200,
            maxParameterCount: 20,
            enableTypeInference: true,
            enableDeepExpansion: true,
            memoryLimitMB: 40
        };
    }

    private isExpandable(value: string, type: string): boolean {
        return (
            value.startsWith('{') ||
            value.startsWith('[') ||
            value.includes('@') ||
            type.includes('List') ||
            type.includes('Map') ||
            type.includes('Set') ||
            type.includes('Object') ||
            type.includes('[]')
        );
    }

    private splitObjectPairs(content: string): string[] {
        const pairs: string[] = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                inQuotes = false;
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
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                inQuotes = false;
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