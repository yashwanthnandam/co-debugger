export interface SimplificationOptions {
    maxDepth: number;
    maxArrayLength: number;
    maxStringLength: number;
    maxObjectKeys: number;
    showPointerAddresses: boolean;
    expandKnownTypes: string[];
    truncateThreshold: number;
    preserveBusinessFields: string[];
    enableLazyExpansion: boolean;
    memoryLimit: number; // MB
}

export interface SimplifiedValue {
    originalType: string;
    displayValue: string;
    isExpanded: boolean;
    hasMore: boolean;
    children?: Record<string, SimplifiedValue>;
    metadata: {
        isPointer: boolean;
        isNil: boolean;
        memoryAddress?: string;
        arrayLength?: number;
        objectKeyCount?: number;
        truncatedAt?: number;
        sizeEstimate?: number;
        expandable?: boolean;
        lazyLoadId?: string;
        recursionDepth?: number;
        circularRefId?: string;
    };
}

export interface VariableExpansionRequest {
    variableName: string;
    path: string[];
    maxDepth: number;
    session: any;
    frameId: number;
    variablesReference: number;
}

export interface RecursionContext {
    visited: Set<string>;
    addressMap: Map<string, SimplifiedValue>;
    currentDepth: number;
    maxDepth: number;
    memoryUsed: number;
    memoryLimit: number;
}

export class DataStructureHandler {
    private defaultOptions: SimplificationOptions = {
        maxDepth: 6,
        maxArrayLength: 50,
        maxStringLength: 1000,
        maxObjectKeys: 50,
        showPointerAddresses: false,
        expandKnownTypes: [
            'string', 'int', 'int64', 'float64', 'bool', 'time.Time',
            'context.Context', 'http.Request', 'http.Response'
        ],
        truncateThreshold: 2000,
        preserveBusinessFields: [
            'id', 'name', 'value', 'data', 'result', 'error', 'message',
            'status', 'code', 'type', 'timestamp', 'created', 'updated'
        ],
        enableLazyExpansion: true,
        memoryLimit: 50 // 50MB limit
    };

    private expansionCache = new Map<string, SimplifiedValue>();
    private lazyExpansionRequests = new Map<string, VariableExpansionRequest>();

    /**
     * Main entry point for variable simplification with recursive dereferencing
     */
    simplifyValue(
        rawValue: string, 
        typeName: string, 
        options: Partial<SimplificationOptions> = {}
    ): SimplifiedValue {
        const opts = { ...this.defaultOptions, ...options };
        
        // Initialize recursion context
        const context: RecursionContext = {
            visited: new Set<string>(),
            addressMap: new Map<string, SimplifiedValue>(),
            currentDepth: 0,
            maxDepth: opts.maxDepth,
            memoryUsed: 0,
            memoryLimit: opts.memoryLimit * 1024 * 1024
        };

        console.log(`🔍 [${new Date().toISOString()}] Starting recursive simplification: ${typeName} = ${rawValue.substring(0, 100)}...`);
        
        return this.recursivelySimplify(rawValue, typeName, context, opts);
    }

    /**
     * Recursive core function that handles all data types with proper dereferencing
     */
    private recursivelySimplify(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        // **RECURSION GUARD: Check depth and memory limits**
        if (context.currentDepth >= context.maxDepth) {
            console.log(`⚠️ Max depth ${context.maxDepth} reached at: ${typeName}`);
            return this.createTruncatedValue(rawValue, typeName, `Max depth ${context.maxDepth} reached`);
        }

        if (context.memoryUsed >= context.memoryLimit) {
            console.log(`⚠️ Memory limit ${options.memoryLimit}MB reached`);
            return this.createTruncatedValue(rawValue, typeName, 'Memory limit exceeded');
        }

        // **STEP 1: Handle nil values early**
        if (this.isNilValue(rawValue)) {
            return this.createSimpleValue('nil', typeName, { isNil: true });
        }

        // **STEP 2: Parse Delve format and extract address**
        const delveInfo = this.parseDelveFormat(rawValue, typeName);
        if (delveInfo) {
            return this.handleDelveFormat(delveInfo, context, options);
        }

        // **STEP 3: Handle pointer dereferencing with circular detection**
        if (this.isPointerSyntax(rawValue, typeName)) {
            return this.handlePointerDereferencing(rawValue, typeName, context, options);
        }

        // **STEP 4: Handle collections recursively**
        if (this.isCollectionType(rawValue, typeName)) {
            return this.handleCollectionRecursively(rawValue, typeName, context, options);
        }

        // **STEP 5: Handle structured data recursively**
        if (this.isStructuredType(rawValue, typeName)) {
            return this.handleStructRecursively(rawValue, typeName, context, options);
        }

        // **STEP 6: Handle primitives**
        if (this.isPrimitiveType(typeName)) {
            return this.handlePrimitive(rawValue, typeName, options);
        }

        // **FALLBACK: JSON or unknown**
        if (this.isPossibleJSON(rawValue)) {
            return this.handleJSONRecursively(rawValue, typeName, context, options);
        }

        return this.handlePrimitive(rawValue, typeName, options);
    }

    /**
     * Parse Delve's debugging format: <*Type>(0xAddress) or <Type> (length: X, cap: Y)
     */
    private parseDelveFormat(rawValue: string, typeName: string): any {
        // Pattern 1: <*Type>(0xAddress) - Pointer with address
        const pointerMatch = rawValue.match(/^<(\*?[^>]+)>\(([^)]+)\)$/);
        if (pointerMatch) {
            const [, type, address] = pointerMatch;
            return {
                type: 'pointer',
                originalType: type,
                memoryAddress: address,
                rawValue
            };
        }

        // Pattern 2: <Type> (length: X, cap: Y) - Collection
        const collectionMatch = rawValue.match(/^<([^>]+)>\s*\(([^)]+)\)$/);
        if (collectionMatch) {
            const [, type, info] = collectionMatch;
            const lengthMatch = info.match(/length:\s*(\d+)/);
            const capMatch = info.match(/cap:\s*(\d+)/);
            
            return {
                type: 'collection',
                originalType: type,
                length: lengthMatch ? parseInt(lengthMatch[1]) : 0,
                capacity: capMatch ? parseInt(capMatch[1]) : undefined,
                rawValue
            };
        }

        return null;
    }

    /**
     * Handle Delve format with proper addressing
     */
    private handleDelveFormat(
        delveInfo: any,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        if (delveInfo.type === 'pointer') {
            const addressId = delveInfo.memoryAddress;
            
            // **CIRCULAR REFERENCE DETECTION**
            if (context.visited.has(addressId)) {
                console.log(`🔄 Circular reference detected at address: ${addressId}`);
                return this.createSimpleValue(`[↻ Circular: ${addressId}]`, delveInfo.originalType, {
                    isPointer: true,
                    memoryAddress: addressId,
                    circularRefId: addressId
                });
            }

            // **CACHED REFERENCE REUSE**
            if (context.addressMap.has(addressId)) {
                const cached = context.addressMap.get(addressId)!;
                console.log(`♻️ Reusing cached reference: ${addressId}`);
                return {
                    ...cached,
                    displayValue: options.showPointerAddresses 
                        ? `[${addressId}] → ${cached.displayValue}`
                        : `→ ${cached.displayValue}`
                };
            }

            // **MARK AS VISITED for circular detection**
            context.visited.add(addressId);

            // Create expandable pointer representation
            const result = this.createSimpleValue(
                `→ ${delveInfo.originalType} {...}`,
                delveInfo.originalType,
                {
                    isPointer: true,
                    memoryAddress: addressId,
                    expandable: true,
                    recursionDepth: context.currentDepth
                }
            );

            // **CACHE THE RESULT**
            context.addressMap.set(addressId, result);
            
            // **REMOVE FROM VISITED after processing**
            context.visited.delete(addressId);
            
            return result;
        }

        if (delveInfo.type === 'collection') {
            return this.createSimpleValue(
                `${delveInfo.originalType}[${delveInfo.length}]${delveInfo.capacity ? ` (cap: ${delveInfo.capacity})` : ''}`,
                delveInfo.originalType,
                {
                    arrayLength: delveInfo.length,
                    expandable: delveInfo.length > 0,
                    recursionDepth: context.currentDepth
                }
            );
        }

        return this.createSimpleValue(delveInfo.rawValue, delveInfo.originalType);
    }

    /**
     * Handle actual Go pointer syntax with recursive dereferencing
     */
    private handlePointerDereferencing(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        console.log(`🎯 Dereferencing pointer: ${typeName} = ${rawValue.substring(0, 50)}...`);

        // Extract actual value from pointer syntax
        const actualValue = this.extractPointerValue(rawValue);
        const actualType = typeName.startsWith('*') ? typeName.substring(1) : typeName;

        // **RECURSIVE DEREFERENCING with depth control**
        if (actualValue !== rawValue && context.currentDepth < 3) {
            const childContext: RecursionContext = {
                ...context,
                currentDepth: context.currentDepth + 1
            };

            const derefResult = this.recursivelySimplify(actualValue, actualType, childContext, options);
            derefResult.metadata.isPointer = true;
            
            console.log(`✅ Successfully dereferenced: ${typeName} → ${derefResult.displayValue}`);
            return derefResult;
        }

        // Fallback for complex or deep pointers
        return this.createSimpleValue(`${actualType} {...}`, actualType, {
            isPointer: true,
            expandable: true,
            recursionDepth: context.currentDepth
        });
    }

    /**
     * Handle collections with recursive element processing
     */
    private handleCollectionRecursively(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        console.log(`📚 Processing collection: ${typeName} = ${rawValue.substring(0, 50)}...`);

        // Extract collection metadata
        const lengthMatch = rawValue.match(/len:\s*(\d+)|length:\s*(\d+)/);
        const capacityMatch = rawValue.match(/cap:\s*(\d+)/);
        const arrayLength = lengthMatch ? parseInt(lengthMatch[1] || lengthMatch[2]) : undefined;

        if (arrayLength === 0 || rawValue === '[]' || rawValue === 'nil') {
            return this.createSimpleValue('[]', typeName, { arrayLength: 0 });
        }

        // **RECURSIVE ELEMENT PROCESSING**
        const elements = this.parseArrayElements(rawValue);
        const children: Record<string, SimplifiedValue> = {};
        const maxElements = Math.min(elements.length, options.maxArrayLength);

        const childContext: RecursionContext = {
            ...context,
            currentDepth: context.currentDepth + 1
        };

        for (let i = 0; i < maxElements; i++) {
            const element = elements[i];
            const elementType = this.inferElementType(element, typeName);
            
            try {
                children[`[${i}]`] = this.recursivelySimplify(element, elementType, childContext, options);
            } catch (error) {
                console.error(`❌ Error processing element ${i}:`, error);
                children[`[${i}]`] = this.createSimpleValue(`[Error: ${error.message}]`, elementType);
            }
        }

        const hasMore = elements.length > options.maxArrayLength;
        const displayValue = hasMore 
            ? `Array[${elements.length}] (showing first ${options.maxArrayLength})`
            : `Array[${elements.length}]`;

        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore,
            children,
            metadata: {
                isPointer: false,
                isNil: false,
                arrayLength: elements.length,
                expandable: true,
                recursionDepth: context.currentDepth
            }
        };
    }

    /**
     * Handle structs with recursive field processing
     */
    private handleStructRecursively(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        console.log(`🏗️ Processing struct: ${typeName} = ${rawValue.substring(0, 50)}...`);

        const fields = this.parseStructFields(rawValue);
        
        if (Object.keys(fields).length === 0) {
            return this.createSimpleValue('{}', typeName);
        }

        // **RECURSIVE FIELD PROCESSING**
        const sortedFields = this.prioritizeFields(fields, options.preserveBusinessFields);
        const truncatedFields = Object.fromEntries(
            Object.entries(sortedFields).slice(0, options.maxObjectKeys)
        );

        const children: Record<string, SimplifiedValue> = {};
        const childContext: RecursionContext = {
            ...context,
            currentDepth: context.currentDepth + 1
        };

        Object.entries(truncatedFields).forEach(([key, value]) => {
            const fieldType = this.inferFieldType(key, value);
            
            try {
                children[key] = this.recursivelySimplify(value, fieldType, childContext, options);
            } catch (error) {
                console.error(`❌ Error processing field ${key}:`, error);
                children[key] = this.createSimpleValue(`[Error: ${error.message}]`, fieldType);
            }
        });

        const hasMore = Object.keys(fields).length > options.maxObjectKeys;
        const displayValue = this.createStructSummary(typeName, Object.keys(truncatedFields), hasMore);

        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore,
            children,
            metadata: {
                isPointer: false,
                isNil: false,
                objectKeyCount: Object.keys(fields).length,
                expandable: true,
                recursionDepth: context.currentDepth
            }
        };
    }

    /**
     * Handle JSON with recursive parsing
     */
    private handleJSONRecursively(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        try {
            const parsed = JSON.parse(rawValue);
            const jsonType = `JSON(${typeof parsed})`;
            
            const childContext: RecursionContext = {
                ...context,
                currentDepth: context.currentDepth + 1
            };

            return this.recursivelySimplify(
                JSON.stringify(parsed, null, 2),
                jsonType,
                childContext,
                options
            );
        } catch {
            return this.handlePrimitive(rawValue, typeName, options);
        }
    }

    /**
     * Handle primitive types (terminal case)
     */
    private handlePrimitive(
        rawValue: string,
        typeName: string,
        options: SimplificationOptions
    ): SimplifiedValue {
        let displayValue = rawValue;

        // Clean up string quotes
        if (typeName === 'string' && displayValue.startsWith('"') && displayValue.endsWith('"')) {
            displayValue = displayValue.slice(1, -1);
        }

        // Smart truncation
        if (displayValue.length > options.maxStringLength) {
            return this.createTruncatedValue(
                displayValue.substring(0, options.maxStringLength),
                typeName,
                `String truncated (${displayValue.length} chars total)`
            );
        }

        return this.createSimpleValue(displayValue, typeName);
    }

    // **ASYNC ON-DEMAND EXPANSION**
    async expandVariableOnDemand(
        session: any,
        frameId: number,
        variableName: string,
        path: string[] = [],
        maxDepth: number = 3
    ): Promise<SimplifiedValue | null> {
        const cacheKey = `${frameId}-${variableName}-${path.join('.')}-${maxDepth}`;
        
        if (this.expansionCache.has(cacheKey)) {
            console.log(`♻️ Using cached expansion for: ${variableName}`);
            return this.expansionCache.get(cacheKey)!;
        }

        try {
            console.log(`🔍 [${new Date().toISOString()}] On-demand expansion: ${variableName} at path: [${path.join(' → ')}] depth: ${maxDepth}`);
            
            const scopes = await session.customRequest('scopes', { frameId });
            
            for (const scope of scopes.scopes) {
                const variables = await session.customRequest('variables', {
                    variablesReference: scope.variablesReference
                });
                
                const targetVar = variables.variables?.find((v: any) => v.name === variableName);
                if (targetVar) {
                    const expanded = await this.deepExpandVariable(
                        session,
                        targetVar,
                        path,
                        maxDepth,
                        0
                    );
                    
                    this.expansionCache.set(cacheKey, expanded);
                    console.log(`✅ Expansion complete for: ${variableName}`);
                    return expanded;
                }
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Error expanding variable ${variableName}:`, error);
            return null;
        }
    }

    private async deepExpandVariable(
        session: any,
        variable: any,
        path: string[],
        maxDepth: number,
        currentDepth: number
    ): Promise<SimplifiedValue> {
        if (currentDepth >= maxDepth) {
            return this.createTruncatedValue(
                variable.value,
                variable.type,
                `Max expansion depth ${maxDepth} reached`
            );
        }

        const result: SimplifiedValue = {
            originalType: variable.type,
            displayValue: variable.value,
            isExpanded: true,
            hasMore: false,
            children: {},
            metadata: {
                isPointer: variable.type?.includes('*') || false,
                isNil: variable.value === 'nil' || variable.value === '<nil>',
                sizeEstimate: this.estimateSize(variable.value),
                recursionDepth: currentDepth
            }
        };

        // **RECURSIVE EXPANSION via variablesReference**
        if (variable.variablesReference && variable.variablesReference > 0) {
            try {
                const children = await session.customRequest('variables', {
                    variablesReference: variable.variablesReference
                });
                
                if (children.variables && children.variables.length > 0) {
                    console.log(`📂 Expanding ${children.variables.length} children for ${variable.name} at depth ${currentDepth}`);
                    
                    const sortedChildren = this.sortChildrenByImportance(children.variables);
                    const maxChildren = Math.min(sortedChildren.length, this.defaultOptions.maxObjectKeys);
                    
                    for (let i = 0; i < maxChildren; i++) {
                        const child = sortedChildren[i];
                        const childPath = [...path, child.name];
                        
                        result.children![child.name] = await this.deepExpandVariable(
                            session,
                            child,
                            childPath,
                            maxDepth,
                            currentDepth + 1
                        );
                    }
                    
                    if (children.variables.length > this.defaultOptions.maxObjectKeys) {
                        result.hasMore = true;
                        result.metadata.truncatedAt = this.defaultOptions.maxObjectKeys;
                    }
                    
                    result.metadata.objectKeyCount = children.variables.length;
                    result.displayValue = this.createStructSummary(
                        variable.type,
                        Object.keys(result.children!),
                        result.hasMore
                    );
                }
            } catch (error) {
                console.error(`❌ Error expanding children for ${variable.name}:`, error);
                result.displayValue = `${variable.type} {Error: ${error.message}}`;
            }
        }

        return result;
    }

    // **UTILITY METHODS**
    private isPointerSyntax(rawValue: string, typeName: string): boolean {
        return (typeName.startsWith('*') && !rawValue.match(/^<[^>]+>\([^)]+\)$/)) ||
               rawValue.includes('*{') ||
               (rawValue.includes('0x') && !rawValue.match(/^<[^>]+>\([^)]+\)$/));
    }

    private extractPointerValue(rawValue: string): string {
        const match = rawValue.match(/\*\w+\s*(\{.*\})/s);
        if (match) return match[1];
        
        const simpleMatch = rawValue.match(/\*\w+\s*(.+)/s);
        if (simpleMatch) return simpleMatch[1];
        
        return rawValue;
    }

    private isPrimitiveType(typeName: string): boolean {
        const primitives = [
            'string', 'int', 'int8', 'int16', 'int32', 'int64',
            'uint', 'uint8', 'uint16', 'uint32', 'uint64',
            'float32', 'float64', 'bool', 'byte', 'rune',
            'time.Time', 'time.Duration'
        ];
        return primitives.some(p => typeName.includes(p));
    }

    private isCollectionType(rawValue: string, typeName: string): boolean {
        return (
            typeName.includes('[]') || 
            typeName.includes('map[') ||
            typeName.includes('slice') ||
            rawValue.includes('len:') ||
            rawValue.includes('length:') ||
            /\[.*\]/.test(rawValue) ||
            (rawValue.startsWith('[') && rawValue.endsWith(']'))
        );
    }

    private isStructuredType(rawValue: string, typeName: string): boolean {
        return (
            (rawValue.includes('{') && rawValue.includes('}')) ||
            typeName.includes('struct') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(rawValue, typeName))
        );
    }

    private isPossibleJSON(rawValue: string): boolean {
        const trimmed = rawValue.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    private isNilValue(rawValue: string): boolean {
        const nilPatterns = ['nil', 'null', '<nil>', 'undefined'];
        return nilPatterns.some(pattern => rawValue.trim() === pattern);
    }

    private parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        let content = rawValue.trim();
        if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1);
        }

        let bracketDepth = 0;
        let currentField = '';
        let currentValue = '';
        let inField = true;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            
            if (char === '{' || char === '[') bracketDepth++;
            else if (char === '}' || char === ']') bracketDepth--;

            if (char === ':' && bracketDepth === 0 && inField) {
                inField = false;
                i++;
                continue;
            }

            if (char === ',' && bracketDepth === 0) {
                if (currentField.trim() && currentValue.trim()) {
                    fields[currentField.trim()] = currentValue.trim();
                }
                currentField = '';
                currentValue = '';
                inField = true;
                i++;
                continue;
            }

            if (inField) currentField += char;
            else currentValue += char;
            
            i++;
        }

        if (currentField.trim() && currentValue.trim()) {
            fields[currentField.trim()] = currentValue.trim();
        }

        return fields;
    }

    private parseArrayElements(rawValue: string): string[] {
        let content = rawValue;
        content = content.replace(/len:\s*\d+,?\s*/g, '');
        content = content.replace(/cap:\s*\d+,?\s*/g, '');
        
        const arrayMatch = content.match(/\[(.*)\]/s);
        if (!arrayMatch) return [];
        
        const elements = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        
        for (const char of arrayMatch[1]) {
            if (char === '"' && !inQuotes) inQuotes = true;
            else if (char === '"' && inQuotes) inQuotes = false;
            else if (!inQuotes) {
                if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') depth--;
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

    private sortChildrenByImportance(variables: any[]): any[] {
        return variables.sort((a, b) => {
            const aScore = this.calculateImportanceScore(a.name, a.value);
            const bScore = this.calculateImportanceScore(b.name, b.value);
            return bScore - aScore;
        });
    }

    private calculateImportanceScore(name: string, value: string): number {
        let score = 0;
        const nameLower = name.toLowerCase();
        
        const highImportancePatterns = [
            'id', 'name', 'type', 'status', 'state', 'code', 'message', 'error',
            'result', 'response', 'data', 'value', 'content', 'body'
        ];
        
        const mediumImportancePatterns = [
            'time', 'date', 'timestamp', 'created', 'updated', 'modified',
            'count', 'length', 'size', 'total', 'amount', 'quantity'
        ];
        
        const lowImportancePatterns = [
            'internal', 'private', 'temp', 'tmp', 'cache', 'buffer',
            'mutex', 'lock', 'sync', 'once', 'pool'
        ];
        
        if (highImportancePatterns.some(pattern => nameLower.includes(pattern))) score += 100;
        if (mediumImportancePatterns.some(pattern => nameLower.includes(pattern))) score += 50;
        if (lowImportancePatterns.some(pattern => nameLower.includes(pattern))) score -= 50;
        if (value && value !== 'nil' && value !== '<nil>' && value !== '0') score += 25;
        
        score -= name.length;
        if (value.includes('{') || value.includes('[')) score += 10;
        
        return score;
    }

    private prioritizeFields(
        fields: Record<string, string>,
        businessFields: string[]
    ): Record<string, string> {
        const prioritized: Record<string, string> = {};
        
        businessFields.forEach(field => {
            const matchingKey = Object.keys(fields).find(key => 
                key.toLowerCase().includes(field.toLowerCase()) ||
                field.toLowerCase().includes(key.toLowerCase())
            );
            if (matchingKey && !(matchingKey in prioritized)) {
                prioritized[matchingKey] = fields[matchingKey];
            }
        });

        const remainingFields = Object.entries(fields)
            .filter(([key]) => !(key in prioritized))
            .sort(([a], [b]) => {
                const aScore = this.calculateImportanceScore(a, fields[a]);
                const bScore = this.calculateImportanceScore(b, fields[b]);
                return bScore - aScore;
            });

        remainingFields.forEach(([key, value]) => {
            prioritized[key] = value;
        });

        return prioritized;
    }

    private createStructSummary(typeName: string, fields: string[], hasMore: boolean): string {
        const fieldList = fields.slice(0, 3).join(', ');
        const summary = `${typeName} {${fieldList}${fields.length > 3 ? '...' : ''}}`;
        return hasMore ? `${summary} (${fields.length} fields shown)` : summary;
    }

    private inferFieldType(fieldName: string, value: string): string {
        if (value === 'nil' || value === 'null') return 'nil';
        if (value === 'true' || value === 'false') return 'bool';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+\.\d+$/.test(value)) return 'float64';
        if (value.startsWith('"') && value.endsWith('"')) return 'string';
        if (value.includes('0x')) return 'pointer';
        if (value.startsWith('{') && value.endsWith('}')) return 'struct';
        if (value.startsWith('[') && value.endsWith(']')) return 'array';
        return 'interface{}';
    }

    private inferElementType(element: string, containerType: string): string {
        const match = containerType.match(/\[\](.+)/);
        if (match) return match[1];
        return this.inferFieldType('', element);
    }

    private createSimpleValue(
        displayValue: string,
        typeName: string,
        metadata: Partial<SimplifiedValue['metadata']> = {}
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore: false,
            metadata: {
                isPointer: false,
                isNil: false,
                sizeEstimate: this.estimateSize(displayValue),
                ...metadata
            }
        };
    }

    private createTruncatedValue(
        displayValue: string,
        typeName: string,
        reason: string
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue: `${displayValue.substring(0, 100)}... [${reason}]`,
            isExpanded: false,
            hasMore: true,
            metadata: {
                isPointer: false,
                isNil: false,
                truncatedAt: displayValue.length,
                expandable: true
            }
        };
    }

    private estimateSize(value: string): number {
        if (!value) return 0;
        let size = value.length * 2;
        if (value.includes('{') || value.includes('[')) size *= 1.5;
        return Math.round(size);
    }

    // **PUBLIC API METHODS**
    async requestLazyExpansion(
        session: any,
        frameId: number,
        lazyLoadId: string,
        maxDepth: number = 3
    ): Promise<SimplifiedValue | null> {
        const request = this.lazyExpansionRequests.get(lazyLoadId);
        if (!request) return null;

        return await this.expandVariableOnDemand(
            request.session,
            request.frameId,
            request.variableName,
            request.path,
            maxDepth
        );
    }

    clearCache(): void {
        this.expansionCache.clear();
        this.lazyExpansionRequests.clear();
        console.log(`🧹 [${new Date().toISOString()}] Cache cleared`);
    }

    getMemoryUsage(): number {
        return Array.from(this.expansionCache.values())
            .reduce((total, value) => total + (value.metadata.sizeEstimate || 0), 0);
    }

    getMemoryUsageFormatted(): string {
        const bytes = this.getMemoryUsage();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    getCacheStats(): { entries: number; memoryUsage: string; hitRate: number } {
        return {
            entries: this.expansionCache.size,
            memoryUsage: this.getMemoryUsageFormatted(),
            hitRate: 0 // Could be calculated with hit/miss tracking
        };
    }
}