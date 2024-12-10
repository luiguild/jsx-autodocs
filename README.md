# JSX AutoDocs

This project is inspired by **Prettify TypeScript**, particularly the TypeScript Type Tree Generator from [**prettify-ts**](https://github.com/mylesmmurphy/prettify-ts).

## What this do
From a simple component like this:
```typescript
type ExternalType = {
  requiredProperty: string
  optionalProperty?: string
}

type MyComponentProps = {
  requiredString: string
  requiredNumber: number
  optionalString?: string
  optionalNumber?: number
  requiredArray: ExternalType[]
  optionalArray?: ExternalType[]
  requiredObject: ExternalType
  optionalObject?: ExternalType
  requiredFunction: () => void
  optionalFunction?: () => void
  requiredPromise: () => Promise<any>
  optionalPromise?: () => Promise<any>
}

function MyComponent(props: MyComponentProps) {
  return <div>Hello, jsxAutoDocs</div>
}

export { MyComponent }
```

Is generated an object like this:
```javascript
{
  name: 'MyComponent',
  exportType: 'named', // or default
  props: { // These are all the props
    requiredString: '',
    requiredNumber: 0,
    optionalString: '',
    optionalNumber: 0,
    requiredArray: [ { requiredProperty: '', optionalProperty: '' } ],
    optionalArray: [ { requiredProperty: '', optionalProperty: '' } ],
    requiredObject: { requiredProperty: '', optionalProperty: '' },
    optionalObject: { requiredProperty: '', optionalProperty: '' },
    requiredFunction: '() => {}',
    optionalFunction: '() => {}',
    requiredPromise: '() => {}',
    optionalPromise: '() => {}'
  },
  required: { // These are only the required props
    requiredString: '',
    requiredNumber: 0,
    requiredArray: [ { requiredProperty: '' } ],
    requiredObject: { requiredProperty: '' },
    requiredFunction: '() => {}',
    requiredPromise: '() => {}'
  }
}
```

And this object is turned into this one:
```javascript
{
  component: 'MyComponent',
  import: "import { MyComponent } from 'jsx-autodocs'",
  minimal: '<MyComponent\n' +
    '  requiredString=""\n' +
    '  requiredNumber={0}\n' +
    '  requiredArray={[{\n' +
    '      requiredProperty: ""\n' +
    '    }]}\n' +
    '  requiredObject={\n' +
    '    requiredProperty: ""\n' +
    '  }\n' +
    '  requiredFunction={() => {}}\n' +
    '  requiredPromise={() => {}}\n' +
    '/>',
  complete: '<MyComponent\n' +
    '  requiredString=""\n' +
    '  requiredNumber={0}\n' +
    '  optionalString=""\n' +
    '  optionalNumber={0}\n' +
    '  requiredArray={[{\n' +
    '      requiredProperty: "",\n' +
    '      optionalProperty: ""\n' +
    '    }]}\n' +
    '  optionalArray={[{\n' +
    '      requiredProperty: "",\n' +
    '      optionalProperty: ""\n' +
    '    }]}\n' +
    '  requiredObject={\n' +
    '    requiredProperty: "",\n' +
    '    optionalProperty: ""\n' +
    '  }\n' +
    '  optionalObject={\n' +
    '    requiredProperty: "",\n' +
    '    optionalProperty: ""\n' +
    '  }\n' +
    '  requiredFunction={() => {}}\n' +
    '  optionalFunction={() => {}}\n' +
    '  requiredPromise={() => {}}\n' +
    '  optionalPromise={() => {}}\n' +
    '/>'
}
```

And then you can just represent your component in your docs with a valid JSX signature like this:

### Minimal
(only required props)
```jsx
<MyComponent
  requiredString=""
  requiredNumber={0}
  requiredArray={[{
      requiredProperty: ""
    }]}
  requiredObject={
    requiredProperty: ""
  }
  requiredFunction={() => {}}
  requiredPromise={() => {}}
/>
```

### Complete
(all props)
```jsx
<MyComponent
  requiredString=""
  requiredNumber={0}
  optionalString=""
  optionalNumber={0}
  requiredArray={[{
      requiredProperty: "",
      optionalProperty: ""
    }]}
  optionalArray={[{
      requiredProperty: "",
      optionalProperty: ""
    }]}
  requiredObject={
    requiredProperty: "",
    optionalProperty: ""
  }
  optionalObject={
    requiredProperty: "",
    optionalProperty: ""
  }
  requiredFunction={() => {}}
  optionalFunction={() => {}}
  requiredPromise={() => {}}
  optionalPromise={() => {}}
/>
```

## How to use it
```shell
npm i -sD jsx-autodocs
```

### Exposed methods
To generate both the minimal and complete **JSX** versions of your component’s documentation, use the **generateDocs** method.
```typescript
import { generateDocs } from 'jsx-autodocs'

const jsx = await generateDocs('./src/components/MyComponent.tsx', 2)
```

If you only want to get the descriptor object of your component, use the **analyzeComponent** method.
```typescript
import { analyzeComponent } from 'jsx-autodocs'

const componentDescriptor = await analyzeComponent('./src/components/MyComponent.tsx')
```

If for any reason you already have the component descriptor or have built it yourself, you can use the **generateJSX** method.
```typescript
import { generateJSX } from 'jsx-autodocs'

const jsx = generateJSX(component, importPackageName, indentLevel)
```

If you already have the necessary information from the file and need a deep type analysis, simply invoke the method **getTypeInfoAtPosition**.
```typescript
import { getTypeInfoAtPosition } from 'jsx-autodocs'

const deepTypeAnaliysis = getTypeInfoAtPosition(typescriptContext, typeChecker, sourceFile, position, options)
```

### Vite Plugin
Example using it in Storybook
```typescript
import { jsxAutoDocsVite } from 'jsx-autodocs'

const config: StorybookConfig = {
  // your Storybook config
  viteFinal: async (config) => {
    config.plugins?.push(
      jsxAutoDocsVite({
        importPackageName: 'my-ui-library',
        indentLevel: 2
      })
    )
    return config
  }
}
```

And then in your docs page you can retrieve the information easily
```typescript
import { findJSXAutoDocs } from 'jsx-autodocs'

const jsx = findJSXAutoDocs('MyComponent')
```

Enjoy and make beautiful automated docs from your components 😊